import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function openDb(path = process.env.DB_PATH || './data/signal.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), {
    recursive: true
  });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL, body TEXT NOT NULL, author TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL CHECK(channel IN ('email','chat','web','phone')),
      category TEXT NOT NULL CHECK(category IN ('payment','access','technical','features','other')),
      status TEXT NOT NULL CHECK(status IN ('new','in_progress','resolved')),
      priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
      reason TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual',
      ai_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_at TEXT,
      version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS ticket_tags (
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(ticket_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      text TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at);
    CREATE INDEX IF NOT EXISTS idx_tickets_category_status ON tickets(category, status);
    CREATE INDEX IF NOT EXISTS idx_events_ticket ON events(ticket_id);
  `);
  db.function('unicode_lower', {
    deterministic: true
  }, s => String(s ?? '').toLocaleLowerCase('ru'));
  migrateAILabels(db);
  return db;
}
export function migrateAILabels(db) {
  if (db.prepare("SELECT 1 FROM settings WHERE key='neutral_ai_labels'").get()) return;
  transaction(db, () => {
    const sources = db.prepare("SELECT DISTINCT source FROM tickets WHERE source NOT IN ('ai','keywords','manual','demo')").all().map(row => row.source);
    const settings = db.prepare("SELECT key,value FROM settings WHERE key LIKE '%_model' AND key != 'ai_model'").all();
    if (settings.length) db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES ('ai_model',?)").run(settings[0].value);
    const names = new Set([...sources, ...settings.map(row => row.key.slice(0,-6))]);
    for (const row of db.prepare('SELECT ai_error FROM tickets WHERE ai_error IS NOT NULL').all()) {
      const match = row.ai_error.match(/^(\S+) (?:недоступна|не успела)/u);
      if (match) names.add(match[1]);
    }
    for (const name of names) {
      for (const spelling of new Set([name,name.toLowerCase(),name.toUpperCase(),name.charAt(0).toUpperCase()+name.slice(1)])) {
        db.prepare('UPDATE events SET text=replace(text,?,?) WHERE instr(text,?)>0').run(spelling,'ИИ',spelling);
        db.prepare('UPDATE tickets SET ai_error=replace(ai_error,?,?) WHERE instr(ai_error,?)>0').run(spelling,'ИИ',spelling);
      }
    }
    db.prepare("UPDATE tickets SET source='ai' WHERE source NOT IN ('ai','keywords','manual','demo')").run();
    for (const row of settings) db.prepare('DELETE FROM settings WHERE key=?').run(row.key);
    db.prepare("INSERT INTO settings(key,value) VALUES ('neutral_ai_labels','1')").run();
  });
}
export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function setTags(db, id, tags) {
  db.prepare('DELETE FROM ticket_tags WHERE ticket_id = ?').run(id);
  for (const name of [...new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean))]) {
    db.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)').run(name);
    db.prepare('INSERT INTO ticket_tags(ticket_id,tag_id) SELECT ?,id FROM tags WHERE name = ?').run(id, name);
  }
}
export function addEvent(db, id, text) {
  db.prepare('INSERT INTO events(ticket_id,text,created_at) VALUES (?,?,?)').run(id, text, new Date().toISOString());
}
export function getTicket(db, id) {
  const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!row) return null;
  row.tags = db.prepare('SELECT name FROM tags JOIN ticket_tags ON tags.id=tag_id WHERE ticket_id=? ORDER BY name').all(id).map(t => t.name);
  row.events = db.prepare('SELECT * FROM events WHERE ticket_id=? ORDER BY id DESC').all(id);
  return row;
}
export function insertTicket(db, data) {
  return transaction(db, () => {
    const now = data.created_at || new Date().toISOString();
    const result = db.prepare(`INSERT INTO tickets(subject,body,author,email,channel,category,status,priority,reason,summary,source,ai_error,created_at,updated_at,resolved_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(data.subject, data.body, data.author, data.email || '', data.channel, data.category, data.status || 'new', data.priority || 'medium', data.reason, data.summary || '', data.source || 'manual', data.ai_error || null, now, now, data.resolved_at || (data.status === 'resolved' ? now : null));
    const id = Number(result.lastInsertRowid);
    setTags(db, id, data.tags || []);
    addEvent(db, id, data.source === 'demo' ? 'Добавлено демонстрационное обращение' : 'Обращение создано');
    return getTicket(db, id);
  });
}
