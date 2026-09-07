import { pathToFileURL } from 'node:url';
import { openDb, insertTicket } from './db.mjs';
import { reasons } from './constants.mjs';
const templates = {
  payment: [['Не проходит оплата подписки', 'Пытаюсь оплатить подписку банковской картой. После подтверждения появляется сообщение об отклонении платежа. На карте достаточно средств.', 'Не проходит оплата'], ['Сумма списалась дважды', 'За продление подписки деньги списались два раза. Прошу проверить повторный платёж и вернуть лишнее списание.', 'Двойное списание'], ['Как вернуть деньги за подписку?', 'Отменил подписку, но деньги уже списаны. Подскажите, как оформить возврат средств за неиспользованный период.', 'Возврат средств'], ['Не получается отменить подписку', 'В настройках не нахожу отключение автоматического продления. Помогите отменить подписку.', 'Управление подпиской']],
  access: [['Не приходит код подтверждения', 'Не могу войти в аккаунт. Код подтверждения на телефон не приходит, несколько раз запрашивал повторно.', 'Не приходит код'], ['Не получается восстановить пароль', 'Ссылка для восстановления пароля перестала работать. При переходе вижу сообщение об истёкшем сроке действия.', 'Восстановление пароля'], ['Аккаунт заблокирован', 'После входа с нового устройства вижу блокировку аккаунта. Как восстановить доступ?', 'Блокировка аккаунта']],
  technical: [['Приложение закрывается при запуске', 'После последнего обновления приложение вылетает при открытии на Android. Переустановка не помогла.', 'Ошибка приложения'], ['Страницы загружаются слишком долго', 'Последние два дня страницы сервиса загружаются больше минуты. Интернет стабилен, другие сайты открываются быстро.', 'Медленная загрузка'], ['Перестали приходить уведомления', 'В настройках уведомления включены, но новые сообщения видны только после открытия приложения.', 'Сбой уведомлений']],
  features: [['Как выгрузить историю операций?', 'Подскажите, где находится экспорт истории операций за месяц и можно ли выбрать формат файла.', 'Вопрос о функциях'], ['Добавьте тёмную тему', 'Часто пользуюсь приложением вечером. Было бы удобно переключать интерфейс в тёмный режим по расписанию.', 'Предложение улучшения']],
  other: [['Вопрос о работе поддержки', 'Подскажите, в какое время работает поддержка и где можно найти справочные материалы по сервису.', 'Общий вопрос']]
};
export function seed(db, now = new Date()) {
  if (db.prepare('SELECT COUNT(*) count FROM tickets').get().count > 0) return 0;
  let count = 0,
    state = 42;
  const random = () => {
    state = state * 1664525 + 1013904223 >>> 0;
    return state / 4294967296;
  };
  const names = ['Анна Смирнова', 'Михаил Волков', 'Елена Козлова', 'Александр Иванов', 'Мария Соколова', 'Дмитрий Петров', 'Ольга Лебедева', 'Артём Морозов', 'Дарья Новикова', 'Илья Попов', 'София Орлова', 'Никита Фёдоров'];
  for (let day = 59; day >= 0; day--) {
    const n = 8 + Math.floor(random() * 15) + (day < 12 ? 7 : 0);
    for (let i = 0; i < n; i++) {
      const v = random();
      const category = v < (day < 30 ? .43 : .25) ? 'payment' : v < .63 ? 'access' : v < .82 ? 'technical' : v < .95 ? 'features' : 'other';
      const [subject, body, reason] = templates[category][Math.floor(random() * templates[category].length)];
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() - day);
      date.setUTCHours(Math.floor(random() * 24), Math.floor(random() * 60), 0, 0);
      if (date > now) date.setTime(now.getTime() - Math.floor(random() * 3600000));
      const status = day > 5 && random() < .84 ? 'resolved' : random() < .58 ? 'in_progress' : 'new';
      const resolvedAt = status === 'resolved' ? new Date(Math.min(now.getTime(), date.getTime() + (1 + random() * 18) * 3600000)).toISOString() : null;
      const person = Math.floor(random() * names.length);
      insertTicket(db, {
        subject,
        body,
        author: names[person],
        email: `user${person + 1}@example.com`,
        channel: ['email', 'chat', 'web', 'phone'][Math.floor(random() * 4)],
        category,
        reason,
        status,
        priority: random() < .22 ? 'high' : random() < .65 ? 'medium' : 'low',
        source: 'demo',
        summary: subject,
        tags: [category === 'technical' ? 'android' : category === 'payment' ? 'подписка' : 'личный кабинет'],
        created_at: date.toISOString(),
        resolved_at: resolvedAt
      });
      count++;
    }
  }
  return count;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  const count = seed(db);
  db.close();
  console.log(count ? `Добавлено ${count} демонстрационных обращений. Все имена и данные вымышлены.` : 'База не пуста. Демонстрационные данные не добавлены.');
}
