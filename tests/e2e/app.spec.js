import { test, expect } from '@playwright/test';
test('Dashboard renders actual data and responsive charts without errors', async ({
  page
}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', {
    name: 'Обзор обращений'
  })).toBeVisible();
  await expect(page.getByRole('heading', {
    name: 'Динамика обращений'
  })).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.screenshot({
    path: 'artifacts/dashboard-desktop.png',
    fullPage: true
  });
  expect(errors).toEqual([]);
});
test('Create, search Cyrillic, edit status/tags/category, verify after reload', async ({
  page
}) => {
  await page.goto('/');
  await page.getByRole('button', {
    name: 'Новое обращение',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Тема обращения').fill('Тест браузера: ДВОЙНАЯ ОПЛАТА');
  await dialog.getByLabel('Текст обращения').fill('Оплата подписки была списана дважды. Прошу проверить платёж.');
  await dialog.getByLabel('Имя пользователя').fill('Тестовый Пользователь');
  await dialog.getByRole('checkbox').uncheck();
  await dialog.getByRole('button', {
    name: 'Сохранить обращение'
  }).click();
  await expect(page.getByRole('heading', {
    name: 'Тест браузера: ДВОЙНАЯ ОПЛАТА'
  })).toBeVisible();
  await page.getByRole('dialog').getByLabel('Статус', {
    exact: true
  }).selectOption('resolved');
  await page.getByRole('dialog').getByLabel('Теги', {
    exact: true
  }).fill('проверка, браузер');
  await page.getByRole('button', {
    name: 'Сохранить изменения'
  }).click();
  await expect(page.getByText('Изменения сохранены', {
    exact: true
  })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', {
    name: 'Закрыть',
    exact: true
  }).last().click();
  await page.getByRole('navigation').getByRole('button', {
    name: /Обращения/
  }).click();
  await page.getByRole('textbox', {
    name: 'Поиск обращений'
  }).fill('тест браузера');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('Решено');
  await page.getByRole('button', {
    name: /Тест браузера: ДВОЙНАЯ ОПЛАТА/
  }).click();
  await expect(page.getByRole('dialog').getByLabel('Теги', {
    exact: true
  })).toHaveValue('браузер, проверка');
  await page.reload();
  await page.getByRole('navigation').getByRole('button', {
    name: /Обращения/
  }).click();
  await page.getByRole('textbox', {
    name: 'Поиск обращений'
  }).fill('тест браузера');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('Решено');
});
test('Filters, empty state, downloads and report fallback', async ({
  page
}) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', {
    name: /Обращения/
  }).click();
  await page.getByRole('textbox', {
    name: 'Поиск обращений'
  }).fill('несуществующий-запрос-9383');
  await expect(page.getByRole('heading', {
    name: 'Ничего не найдено'
  })).toBeVisible();
  await page.getByRole('button', {
    name: 'Сбросить',
    exact: true
  }).click();
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await page.getByLabel('Категория', {
    exact: true
  }).selectOption('access');
  await expect(page.locator('tbody tr').first()).toContainText('Доступ к аккаунту');
  await page.getByRole('button', {
    name: 'Экспорт',
    exact: true
  }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('link', {
    name: 'Скачать CSV'
  }).click();
  expect((await download).suggestedFilename()).toMatch(/signal-summary/);
  await page.getByRole('navigation').getByRole('button', {
    name: 'Отчёты',
    exact: true
  }).click();
  await page.getByRole('button', {
    name: 'Сформировать ИИ-отчёт'
  }).click();
  await expect(page.getByText('Показана сводка по статистике.', {
    exact: false
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Скачать отчёт TXT'
  })).toBeVisible();
});
test('Automatic analysis gracefully falls back without losing the ticket', async ({
  page
}) => {
  await page.goto('/');
  await page.getByRole('button', {
    name: 'Новое обращение',
    exact: true
  }).click();
  await page.getByLabel('Тема обращения').fill('Не приходит код подтверждения');
  await page.getByLabel('Текст обращения').fill('Не могу войти в аккаунт, так как код подтверждения не приходит.');
  await page.getByLabel('Имя пользователя').fill('Иван Тестовый');
  await page.getByRole('button', {
    name: 'Сохранить обращение'
  }).click();
  await expect(page.getByRole('dialog').getByText('Использованы ключевые слова.', {
    exact: false
  }).first()).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Категория', {
    exact: true
  })).toHaveValue('access');
});
test('Mobile navigation, layout and accessible modal dismissal', async ({
  page
}) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.goto('/');
  await expect(page.getByRole('heading', {
    name: 'Динамика обращений'
  })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: 'artifacts/dashboard-mobile.png',
    fullPage: true
  });
  await page.getByRole('button', {
    name: 'Открыть меню'
  }).click();
  await page.getByRole('button', {
    name: 'Настройки',
    exact: true
  }).click();
  await expect(page.getByRole('heading', {
    name: 'Подключение ИИ'
  })).toBeVisible();
  await page.getByRole('button', {
    name: 'Новое обращение',
    exact: true
  }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
