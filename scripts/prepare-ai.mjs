import { openDb } from '../server/db.mjs';
import { modelName } from '../server/ai.mjs';
const db = openDb();
const model = modelName(db);
db.close();
const url = (process.env.AI_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
try {
  const health = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!health.ok) throw new Error('Сервер ИИ недоступен');
  const data = await health.json();
  if (data.models?.some(item => item.name === model)) {
    console.log(`Модель ${model} уже установлена.`);
  } else {
    console.log(`Загрузка модели ${model}. Это может занять несколько минут.`);
    const response = await fetch(`${url}/api/pull`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false }),
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error('Не удалось загрузить модель');
    console.log(`Модель ${model} готова. Проверка: npm run ai:check`);
  }
} catch {
  console.error(`Подготовка ИИ не завершена. Запустите совместимый сервер по адресу ${url}, проверьте имя модели и доступ к сети, затем повторите команду.`);
  process.exitCode = 1;
}
