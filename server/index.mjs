import { createApp } from './app.mjs';
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const server = createApp().listen(port, host, () => console.log(`Сигнал: http://${host}:${port}`));
server.on('error', error => {
  console.error(`Ошибка запуска: ${error.message}`);
  process.exitCode = 1;
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
