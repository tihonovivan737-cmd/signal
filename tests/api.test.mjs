import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, insertTicket, getTicket, migrateAILabels } from '../server/db.mjs';
import { createApp, toCsv } from '../server/app.mjs';
import { analytics, dateRange } from '../server/analytics.mjs';
import { classify, keywordClassify, summarize } from '../server/ai.mjs';
import { seed } from '../server/seed.mjs';
let db, server, base;
const sample = {
  subject: 'Оплата списалась дважды',
  body: 'При оплате подписки с карты дважды списали деньги. Помогите вернуть второй платёж.',
  author: 'Анна Тестовая',
  email: 'anna@example.com',
  channel: 'email',
  priority: 'high',
  tags: ['подписка', 'подписка']
};
const validAI = {
  category: 'payment',
  reason: 'Двойное списание',
  summary: 'Повторное списание за подписку.',
  priority: 'high',
  tags: ['платёж']
};
const mockAI = async (url, options) => ({
  ok: true,
  json: async () => ({
    done: true,
    response: JSON.stringify(validAI)
  })
});
before(async () => {
  db = openDb(':memory:');
  server = createApp({
    db,
    fetcher: mockAI
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(r => server.close(r));
  db.close();
});
async function request(path, method = 'GET', body) {
  const res = await fetch(base + '/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  return {
    status: res.status,
    data
  };
}
test('Create, persist fields and tags, retrieve detail, classify, update and reject stale edits', async () => {
  const created = await request('/tickets', 'POST', sample);
  assert.equal(created.status, 201);
  assert.equal(created.data.source, 'keywords');
  assert.deepEqual(created.data.tags, ['подписка']);
  const id = created.data.id;
  const detail = await request(`/tickets/${id}`);
  assert.equal(detail.data.body, sample.body);
  assert.equal(detail.data.events.length, 1);
  const analyzed = await request(`/tickets/${id}/classify`, 'POST', {});
  assert.equal(analyzed.data.source, 'ai');
  assert.equal(analyzed.data.reason, 'Двойное списание');
  assert.ok(analyzed.data.tags.includes('подписка'));
  assert.ok(analyzed.data.tags.includes('платёж'));
  const resolved = await request(`/tickets/${id}`, 'PATCH', {
    status: 'resolved',
    version: analyzed.data.version
  });
  assert.equal(resolved.status, 200);
  assert.ok(resolved.data.resolved_at);
  assert.equal((await request(`/tickets/${id}`, 'PATCH', {
    status: 'new',
    version: 1
  })).status, 409);
  const reopened = await request(`/tickets/${id}`, 'PATCH', {
    status: 'in_progress',
    version: resolved.data.version,
    category: 'technical',
    reason: 'Ошибка приложения'
  });
  assert.equal(reopened.data.resolved_at, null);
  assert.equal(reopened.data.source, 'manual');
  assert.equal(reopened.data.events.length, 4);
});
test('Russian case-insensitive search and combined filters; literal LIKE characters', async () => {
  await request('/tickets', 'POST', {
    ...sample,
    subject: 'УНИКАЛЬНАЯ ПОДПИСКА 100%',
    author: 'МАРИЯ КОЗЛОВА'
  });
  const found = await request('/tickets?q=' + encodeURIComponent('уникальная') + '&category=payment&status=new&channel=email&priority=high&tag=' + encodeURIComponent('подписка'));
  assert.equal(found.data.total, 1);
  assert.equal((await request('/tickets?q=' + encodeURIComponent('мария козлова'))).data.total, 1);
  assert.equal((await request('/tickets?q=' + encodeURIComponent('%'))).data.total, 1);
  assert.equal((await request('/tickets?q=' + encodeURIComponent("' OR 1=1 --"))).data.total, 0);
  assert.equal((await request('/tickets?limit=1&page=2')).data.items.length, 1);
});
test('Input validation, nonexistent IDs, invalid dates, pagination and category/reason mismatch', async () => {
  assert.equal((await request('/tickets', 'POST', {
    subject: 'x'
  })).status, 400);
  assert.equal((await request('/tickets', 'POST', {
    ...sample,
    channel: 'invalid'
  })).status, 400);
  assert.equal((await request('/tickets/999999')).status, 404);
  assert.equal((await request('/tickets/NaN')).status, 400);
  for (const q of ['from=2026-02-30', 'from=2026-05-03&to=2026-05-01', 'from=2020-01-01&to=2026-01-01', 'page=0', 'limit=1000', 'category=invalid']) assert.equal((await request('/tickets?' + q)).status, 400, q);
  const t = (await request('/tickets/1')).data;
  assert.equal((await request('/tickets/1', 'PATCH', {
    version: t.version,
    category: 'access',
    reason: 'Двойное списание'
  })).status, 400);
});
test('Mutation rejects cross-site requests and non-JSON content', async () => {
  const res = await fetch(base + '/api/tickets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.com'
    },
    body: JSON.stringify(sample)
  });
  assert.equal(res.status, 403);
  const text = await fetch(base + '/api/tickets', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    },
    body: '{}'
  });
  assert.equal(text.status, 415);
});
test('Analytics date boundaries, empty days, equal previous period, average and spike detection', () => {
  const local = openDb(':memory:');
  for (let i = 0; i < 5; i++) insertTicket(local, {
    ...sample,
    category: 'payment',
    reason: 'Двойное списание',
    created_at: '2026-01-01T12:00:00.000Z'
  });
  for (let i = 0; i < 10; i++) insertTicket(local, {
    ...sample,
    category: 'payment',
    reason: 'Двойное списание',
    created_at: '2026-01-04T00:00:00.000Z',
    status: 'resolved',
    resolved_at: '2026-01-04T02:00:00.000Z'
  });
  insertTicket(local, {
    ...sample,
    category: 'technical',
    reason: 'Ошибка приложения',
    created_at: '2026-01-06T23:59:59.999Z'
  });
  insertTicket(local, {
    ...sample,
    category: 'other',
    reason: 'Общий вопрос',
    created_at: '2026-01-07T00:00:00.000Z'
  });
  const stats = analytics(local, {
    from: '2026-01-04',
    to: '2026-01-06'
  });
  assert.equal(stats.metrics.total, 11);
  assert.equal(stats.metrics.previousTotal, 5);
  assert.equal(stats.metrics.avgResolutionHours, 2);
  assert.equal(stats.metrics.resolved, 10);
  assert.equal(stats.daily[1].total, 0);
  assert.equal(stats.alerts[0].change, 100);
  assert.deepEqual(stats.previousRange, {
    from: '2026-01-01',
    to: '2026-01-03'
  });
  assert.equal(analytics(local, {
    from: '2026-01-04',
    to: '2026-01-06',
    category: 'payment'
  }).metrics.total, 10);
  const empty = analytics(local, {
    from: '2026-03-01',
    to: '2026-03-01'
  });
  assert.equal(empty.metrics.total, 0);
  assert.equal(empty.metrics.avgResolutionHours, null);
  assert.equal(empty.metrics.totalChange, null);
  local.close();
});
test('ИИ validation, redaction and transparent fallback', async () => {
  let sent;
  const parsed = await classify(db, 'Оплата', 'Мой email anna@example.com и телефон +7 (999) 123-45-67. Списание дважды.', async (url, opts) => {
    sent = JSON.parse(opts.body);
    return mockAI();
  });
  assert.equal(parsed.source, 'ai');
  assert.ok(!sent.prompt.includes('anna@example.com'));
  assert.ok(!sent.prompt.includes('999'));
  assert.equal(sent.stream, false);
  for (const responder of [async () => {
    throw new Error('offline');
  }, async () => ({
    ok: true,
    json: async () => ({
      response: 'invalid JSON'
    })
  }), async () => ({
    ok: true,
    json: async () => ({
      response: JSON.stringify({
        ...validAI,
        category: 'access'
      })
    })
  })]) {
    const result = await classify(db, sample.subject, sample.body, responder);
    assert.equal(result.source, 'keywords');
    assert.equal(result.category, 'payment');
    assert.ok(result.ai_error);
  }
  assert.equal(keywordClassify('Здравствуйте', 'Просто общий вопрос').category, 'other');
});
test('AI report fallback and no PII in aggregate prompt', async () => {
  const stats = analytics(db, {});
  let prompt;
  const report = await summarize(db, stats, async (url, opts) => {
    prompt = opts.body;
    return {
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          text: 'Обращения касаются оплаты и технических ошибок.'
        })
      })
    };
  });
  assert.equal(report.source, 'ai');
  assert.ok(!prompt.includes(sample.email));
  assert.ok(!prompt.includes(sample.author));
  const fallback = await summarize(db, stats, async () => {
    throw new Error('offline');
  });
  assert.equal(fallback.source, 'statistics');
  assert.ok(fallback.warning);
});
test('CSV export respects filters and escapes spreadsheet formulas, quotes and line breaks', async () => {
  const csv = toCsv([['=SUM(1;1)', 'normal', 'a"b', 'line1\nline2', ' +cmd']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=SUM(1;1)"'));
  assert.ok(csv.includes('"a""b"'));
  assert.ok(csv.includes('"\' +cmd"'));
  const res = await fetch(base + '/api/reports/export?format=tickets&q=' + encodeURIComponent('уникальная'));
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.includes('УНИКАЛЬНАЯ'));
  assert.ok(!body.includes('Оплата списалась дважды'));
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const summary = await fetch(base + '/api/reports/export?format=summary');
  assert.ok((await summary.text()).includes('Предыдущий период'));
});
test('File database survives reconnect, seed is explicit and idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signal-test-'));
  const path = join(dir, 'test.sqlite');
  let local = openDb(path);
  assert.equal(local.prepare('SELECT count(*) count FROM tickets').get().count, 0);
  const count = seed(local, new Date('2026-09-07T12:00:00Z'));
  assert.ok(count > 500);
  assert.equal(seed(local), 0);
  local.close();
  local = openDb(path);
  assert.equal(local.prepare('SELECT count(*) count FROM tickets').get().count, count);
  local.close();
  rmSync(dir, {
    recursive: true
  });
});
test('Concurrent manual edit is not overwritten by a late model response', async () => {
  const local = openDb(':memory:');
  let release;
  const pending = new Promise(r => release = r);
  let entered;
  const started = new Promise(r => entered = r);
  const s = createApp({
    db: local,
    fetcher: async () => {
      entered();
      await pending;
      return mockAI();
    }
  }).listen(0, '127.0.0.1');
  await new Promise(r => s.once('listening', r));
  const url = `http://127.0.0.1:${s.address().port}/api/tickets`;
  const item = insertTicket(local, {
    ...sample,
    ...keywordClassify(sample.subject, sample.body)
  });
  try {
    const result = fetch(`${url}/${item.id}/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    await started;
    const edit = await fetch(`${url}/${item.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 1,
        priority: 'low'
      })
    });
    assert.equal(edit.status, 200);
    release();
    assert.equal((await result).status, 409);
    assert.equal(getTicket(local, item.id).priority, 'low');
  } finally {
    release();
    await new Promise(r => s.close(r));
    local.close();
  }
});

test('Legacy model settings, classification and history migrate without losing ticket data', () => {
  const local = openDb(':memory:');
  local.prepare("DELETE FROM settings WHERE key='neutral_ai_labels'").run();
  const row = insertTicket(local, {...sample, category:'payment', reason:'Двойное списание', source:'legacy', ai_error:'Legacy недоступна. Использованы ключевые слова.'});
  local.prepare("INSERT INTO settings(key,value) VALUES ('legacy_model','custom:3b')").run();
  local.prepare('INSERT INTO events(ticket_id,text,created_at) VALUES (?,?,?)').run(row.id,'Анализ Legacy завершён',new Date().toISOString());
  migrateAILabels(local);
  assert.equal(local.prepare("SELECT value FROM settings WHERE key='ai_model'").get().value,'custom:3b');
  const updated=getTicket(local,row.id);
  assert.equal(updated.source,'ai');
  assert.equal(updated.body,sample.body);
  assert.equal(updated.events[0].text,'Анализ ИИ завершён');
  assert.ok(!updated.ai_error.includes('Legacy'));
  migrateAILabels(local);
  assert.equal(getTicket(local,row.id).events.length,2);
  local.close();
});
