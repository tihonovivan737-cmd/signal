import { categories } from './constants.mjs';
const DAY = 86400000;
export const utcDate = date => date.toISOString().slice(0, 10);
export function dateRange(query = {}) {
  const to = query.to || utcDate(new Date());
  const from = query.from || utcDate(new Date(Date.parse(to) - 29 * DAY));
  for (const value of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || utcDate(new Date(value)) !== value) throw Object.assign(new Error('Укажите корректные даты'), {
      status: 400
    });
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  if (days < 1 || days > 366) throw Object.assign(new Error('Период должен составлять от 1 до 366 дней'), {
    status: 400
  });
  return {
    from,
    to,
    days
  };
}
export function whereTickets(query, {
  period = true
} = {}) {
  const clauses = [],
    params = [];
  if (period) {
    const {
      from,
      to
    } = dateRange(query);
    clauses.push('t.created_at >= ? AND t.created_at < ?');
    params.push(`${from}T00:00:00.000Z`, new Date(Date.parse(to) + DAY).toISOString());
  }
  for (const key of ['category', 'status', 'priority', 'channel']) {
    if (query[key] && query[key] !== 'all') {
      clauses.push(`t.${key} = ?`);
      params.push(query[key]);
    }
  }
  if (query.q?.trim()) {
    clauses.push("(unicode_lower(t.subject || ' ' || t.body || ' ' || t.author || ' ' || t.email || ' ' || t.reason) LIKE ? ESCAPE '\\' OR CAST(t.id AS TEXT) = ?)");
    params.push(`%${query.q.trim().toLowerCase().replace(/[\\%_]/g, '\\$&')}%`, query.q.trim().replace(/^#/, ''));
  }
  if (query.tag?.trim()) {
    clauses.push('EXISTS (SELECT 1 FROM ticket_tags tt JOIN tags tg ON tg.id=tt.tag_id WHERE tt.ticket_id=t.id AND tg.name=?)');
    params.push(query.tag.trim().toLowerCase());
  }
  return {
    sql: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '',
    params
  };
}
export function analytics(db, query) {
  const range = dateRange(query);
  const previous = {
    from: utcDate(new Date(Date.parse(range.from) - range.days * DAY)),
    to: utcDate(new Date(Date.parse(range.from) - DAY))
  };
  const currentWhere = whereTickets(query);
  const previousWhere = whereTickets({
    ...query,
    ...previous
  });
  const rows = db.prepare(`SELECT t.* FROM tickets t ${currentWhere.sql}`).all(...currentWhere.params);
  const old = db.prepare(`SELECT t.* FROM tickets t ${previousWhere.sql}`).all(...previousWhere.params);
  const resolved = rows.filter(r => r.status === 'resolved');
  const times = resolved.filter(r => r.resolved_at).map(r => Math.max(0, Date.parse(r.resolved_at) - Date.parse(r.created_at)) / 3600000);
  const delta = (now, before) => before ? Math.round((now - before) / before * 100) : null;
  const categoryData = categories.map(c => {
    const count = rows.filter(r => r.category === c.id).length;
    const before = old.filter(r => r.category === c.id).length;
    return {
      ...c,
      count,
      previous: before,
      change: delta(count, before),
      share: rows.length ? Math.round(count / rows.length * 100) : 0
    };
  });
  const daily = Array.from({
    length: range.days
  }, (_, i) => {
    const date = utcDate(new Date(Date.parse(range.from) + i * DAY));
    const oldDate = utcDate(new Date(Date.parse(previous.from) + i * DAY));
    return {
      date,
      total: rows.filter(r => r.created_at.startsWith(date)).length,
      previous: old.filter(r => r.created_at.startsWith(oldDate)).length,
      resolved: rows.filter(r => r.created_at.startsWith(date) && r.status === 'resolved').length
    };
  });
  const reasonMap = new Map();
  for (const row of rows) {
    const key = `${row.category}:${row.reason}`;
    if (!reasonMap.has(key)) reasonMap.set(key, {
      name: row.reason,
      category: row.category,
      count: 0
    });
    reasonMap.get(key).count++;
  }
  return {
    range,
    previousRange: previous,
    metrics: {
      total: rows.length,
      totalChange: delta(rows.length, old.length),
      previousTotal: old.length,
      resolved: resolved.length,
      resolvedRate: rows.length ? Math.round(resolved.length / rows.length * 100) : 0,
      active: rows.filter(r => r.status !== 'resolved').length,
      high: rows.filter(r => r.priority === 'high' && r.status !== 'resolved').length,
      avgResolutionHours: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length * 10) / 10 : null
    },
    daily,
    categories: categoryData,
    reasons: [...reasonMap.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    channels: ['email', 'chat', 'web', 'phone'].map(id => ({
      id,
      count: rows.filter(r => r.channel === id).length
    })),
    alerts: categoryData.filter(c => c.previous >= 5 && c.count >= 10 && c.change >= 50).map(c => ({
      category: c.id,
      title: `Рост: ${c.name.toLowerCase()}`,
      text: `${c.count} обращений, на ${c.change}% больше предыдущего периода (${c.previous}).`,
      change: c.change
    }))
  };
}
