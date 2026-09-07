import { openDb } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/seed.mjs';
process.env.AI_URL = 'http://127.0.0.1:1';
const db = openDb(':memory:');
seed(db);
createApp({
  db
}).listen(3101, '127.0.0.1', () => console.log('Isolated E2E server ready'));
