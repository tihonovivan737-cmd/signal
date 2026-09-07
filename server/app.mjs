import express from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { openDb, getTicket, insertTicket, transaction, setTags, addEvent } from './db.mjs';
import { categories, statuses, priorities, channels, reasons } from './constants.mjs';
import { analytics, whereTickets, dateRange } from './analytics.mjs';
import { classify, keywordClassify, modelName, aiStatus, summarize } from './ai.mjs';
const categoryEnum = z.enum(categories.map(c => c.id));
const fields = {
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(12000),
  author: z.string().trim().min(2).max(100),
  email: z.union([z.email(), z.literal('')]).default(''),
  channel: z.enum(Object.keys(channels)).default('web'),
  priority: z.enum(Object.keys(priorities)).default('medium'),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([])
};
const createSchema = z.object(fields).strict();
const patchSchema = z.object({
  category: categoryEnum.optional(),
  reason: z.string().trim().min(1).max(150).optional(),
  status: z.enum(Object.keys(statuses)).optional(),
  priority: z.enum(Object.keys(priorities)).optional(),
  tags: fields.tags.optional(),
  version: z.number().int().positive()
}).strict();
const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().max(300).optional(),
  tag: z.string().max(40).optional(),
  category: z.union([categoryEnum, z.literal('all')]).optional(),
  status: z.enum([...Object.keys(statuses), 'all']).optional(),
  priority: z.enum([...Object.keys(priorities), 'all']).optional(),
  channel: z.enum([...Object.keys(channels), 'all']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  format: z.enum(['tickets', 'summary']).optional()
});
const fail = (status, message) => {
  throw Object.assign(new Error(message), {
    status
  });
};
const csvCell = value => {
  let s = String(value ?? '');
  if (/^[\s]*[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export const toCsv = rows => '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
export function createApp({
  db = openDb(),
  fetcher
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({
        error: 'Запрос с другого сайта запрещён'
      });
      const origin = req.get('origin');
      if (origin) {
        try {
          const url = new URL(origin);
          const host = req.hostname;
          if (url.hostname !== host) return res.status(403).json({
            error: 'Недопустимый источник запроса'
          });
        } catch {
          return res.status(403).json({
            error: 'Некорректный источник запроса'
          });
        }
      }
      if (!req.is('application/json')) return res.status(415).json({
        error: 'Ожидается JSON'
      });
    }
    next();
  });
  app.use(express.json({
    limit: '100kb'
  }));
  const query = req => {
    const q = querySchema.parse(req.query);
    dateRange(q);
    return q;
  };
  const ticket = req => {
    if (!/^[1-9]\d*$/.test(req.params.id)) fail(400, 'Некорректный номер обращения');
    const row = getTicket(db, Number(req.params.id));
    if (!row) fail(404, 'Обращение не найдено');
    return row;
  };
  app.get('/api/health', (req, res) => res.json({
    ok: true,
    service: 'Сигнал',
    version: '1.0.0'
  }));
  app.get('/api/meta', (req, res) => res.json({
    categories,
    statuses,
    priorities,
    channels,
    reasons,
    tags: db.prepare('SELECT DISTINCT name FROM tags JOIN ticket_tags ON tags.id=tag_id ORDER BY name').all().map(t => t.name),
    demo: Boolean(db.prepare("SELECT 1 FROM tickets WHERE source='demo' LIMIT 1").get())
  }));
  app.get('/api/tickets', (req, res) => {
    const q = query(req);
    const {
      sql,
      params
    } = whereTickets(q);
    const total = db.prepare(`SELECT COUNT(*) count FROM tickets t ${sql}`).get(...params).count;
    const rows = db.prepare(`SELECT t.id FROM tickets t ${sql} ORDER BY t.created_at DESC,t.id DESC LIMIT ? OFFSET ?`).all(...params, q.limit, (q.page - 1) * q.limit);
    res.json({
      items: rows.map(r => {
        const {
          events,
          body,
          ...item
        } = getTicket(db, r.id);
        return item;
      }),
      total,
      page: q.page,
      pages: Math.ceil(total / q.limit)
    });
  });
  app.post('/api/tickets', (req, res) => {
    const data = createSchema.parse(req.body);
    const classified = keywordClassify(data.subject, data.body);
    const row = insertTicket(db, {
      ...data,
      ...classified,
      priority: data.priority,
      tags: data.tags
    });
    res.status(201).json(row);
  });
  app.get('/api/tickets/:id', (req, res) => res.json(ticket(req)));
  app.patch('/api/tickets/:id', (req, res) => {
    const current = ticket(req);
    const patch = patchSchema.parse(req.body);
    if (patch.version !== current.version) fail(409, 'Обращение изменилось. Откройте карточку заново.');
    const category = patch.category || current.category;
    const reason = patch.reason || (category !== current.category ? reasons[category][0] : current.reason);
    if (!reasons[category].includes(reason)) fail(400, 'Причина не соответствует категории');
    transaction(db, () => {
      const now = new Date().toISOString(),
        status = patch.status || current.status;
      db.prepare('UPDATE tickets SET category=?,reason=?,status=?,priority=?,source=?,resolved_at=?,updated_at=?,version=version+1 WHERE id=?').run(category, reason, status, patch.priority || current.priority, patch.category || patch.reason ? 'manual' : current.source, status === 'resolved' ? current.resolved_at || now : null, now, current.id);
      if (patch.tags) setTags(db, current.id, patch.tags);
      const changes = [];
      if (patch.status && patch.status !== current.status) changes.push(`Статус: ${statuses[patch.status]}`);
      if (patch.category) changes.push(`Категория: ${categories.find(c => c.id === category).name}`);
      if (patch.reason) changes.push(`Причина: ${reason}`);
      if (patch.priority) changes.push(`Приоритет: ${priorities[patch.priority]}`);
      if (patch.tags) changes.push('Теги обновлены');
      addEvent(db, current.id, changes.join(' · ') || 'Обращение обновлено');
    });
    res.json(getTicket(db, current.id));
  });
  const activeAI = new Set();
  app.post('/api/tickets/:id/classify', async (req, res) => {
    const current = ticket(req);
    if (activeAI.has(current.id) || activeAI.size >= 2) fail(429, 'Анализ уже выполняется. Попробуйте немного позже.');
    activeAI.add(current.id);
    try {
      const result = await classify(db, current.subject, current.body, fetcher);
      const latest = getTicket(db, current.id);
      if (latest.version !== current.version) fail(409, 'Карточка изменилась во время анализа. Изменения сохранены; повторите анализ.');
      transaction(db, () => {
        db.prepare('UPDATE tickets SET category=?,reason=?,summary=?,priority=?,source=?,ai_error=?,updated_at=?,version=version+1 WHERE id=?').run(result.category, result.reason, result.summary, result.priority, result.source, result.ai_error, new Date().toISOString(), current.id);
        setTags(db, current.id, [...new Set([...current.tags, ...result.tags])].slice(0, 10));
        addEvent(db, current.id, result.source === 'ai' ? `Категория и краткое описание определены ИИ (${modelName(db)})` : result.ai_error);
      });
      res.json(getTicket(db, current.id));
    } finally {
      activeAI.delete(current.id);
    }
  });
  app.get('/api/analytics', (req, res) => res.json(analytics(db, query(req))));
  app.get('/api/ai', async (req, res) => res.json(await aiStatus(db)));
  app.put('/api/settings/model', async (req, res) => {
    const {
      model
    } = z.object({
      model: z.string().min(1).max(100)
    }).strict().parse(req.body);
    const status = await aiStatus(db);
    if (!status.models.includes(model)) fail(400, 'Модель не установлена на сервере ИИ');
    db.prepare("INSERT INTO settings(key,value) VALUES ('ai_model',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(model);
    res.json({
      model
    });
  });
  let reportBusy = false;
  app.post('/api/reports/summary', async (req, res) => {
    const q = query(req);
    if (reportBusy) fail(429, 'Отчёт уже формируется. Попробуйте позже.');
    reportBusy = true;
    try {
      const stats = analytics(db, q);
      res.json({
        ...(await summarize(db, stats, fetcher)),
        range: stats.range,
        created_at: new Date().toISOString()
      });
    } finally {
      reportBusy = false;
    }
  });
  app.get('/api/reports/export', (req, res) => {
    const q = query(req);
    const range = dateRange(q);
    let rows;
    if (q.format === 'summary') {
      const stats = analytics(db, q);
      rows = [['Аналитический отчёт «Сигнал»', `${range.from} — ${range.to}`], ['Показатель', 'Значение'], ['Всего обращений', stats.metrics.total], ['Решено', stats.metrics.resolved], ['В работе и новые', stats.metrics.active], ['Среднее время решения, ч', stats.metrics.avgResolutionHours ?? 'Нет данных'], [], ['Категория', 'Количество', 'Предыдущий период', 'Изменение, %'], ...stats.categories.map(c => [c.name, c.count, c.previous, c.change ?? 'Нет базы сравнения']), [], ['Причина', 'Количество'], ...stats.reasons.map(r => [r.name, r.count])];
    } else {
      const {
        sql,
        params
      } = whereTickets(q);
      const items = db.prepare(`SELECT t.* FROM tickets t ${sql} ORDER BY t.created_at DESC`).all(...params);
      rows = [['ID', 'Тема', 'Текст', 'Автор', 'Email', 'Канал', 'Категория', 'Причина', 'Статус', 'Приоритет', 'Теги', 'Создано (UTC)', 'Решено (UTC)', 'Источник категории'], ...items.map(r => [r.id, r.subject, r.body, r.author, r.email, channels[r.channel], categories.find(c => c.id === r.category).name, r.reason, statuses[r.status], priorities[r.priority], getTicket(db, r.id).tags.join(', '), r.created_at, r.resolved_at, r.source])];
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="signal-${q.format || 'tickets'}-${range.from}-${range.to}.csv"`);
    res.send(toCsv(rows));
  });
  app.use('/api', (req, res) => res.status(404).json({
    error: 'Метод API не найден'
  }));
  if (existsSync(resolve('dist/index.html'))) {
    app.use(express.static(resolve('dist')));
    app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError) return res.status(400).json({
      error: 'Проверьте заполнение полей',
      details: error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    });
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({
      error: status === 500 ? 'Не удалось выполнить операцию' : error.message
    });
  });
  return app;
}
