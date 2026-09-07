import { openDb, insertTicket } from '../server/db.mjs';
import { classify, aiStatus, summarize, modelName } from '../server/ai.mjs';
import { analytics } from '../server/analytics.mjs';
const settingsDb = openDb();
const selectedModel = modelName(settingsDb);
settingsDb.close();
const db = openDb(':memory:');
db.prepare("INSERT INTO settings(key,value) VALUES ('ai_model',?)").run(selectedModel);
try {
  const status = await aiStatus(db);
  console.log(JSON.stringify({
    ready: status.ready,
    model: status.model
  }));
  if (!status.ready) throw new Error('Настройте и запустите модель ИИ');
  const start = Date.now();
  const result = await classify(db, 'Деньги списались дважды', 'При оплате месячной подписки с моей банковской карты списали одну и ту же сумму два раза. Прошу вернуть повторный платёж.');
  console.log(JSON.stringify({
    classification: result,
    seconds: (Date.now() - start) / 1000
  }, null, 2));
  if (result.source !== 'ai') throw new Error('Модель не прошла проверку категоризации');
  insertTicket(db, {
    subject: 'Деньги списались дважды',
    body: 'Тестовое обращение.',
    author: 'Тест',
    channel: 'web',
    ...result
  });
  const report = await summarize(db, analytics(db, {}));
  console.log(JSON.stringify({
    report
  }, null, 2));
  if (report.source !== 'ai') throw new Error('Модель не прошла проверку отчёта');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
