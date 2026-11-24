import { expect, test } from '@playwright/test';
import { FIXED_NOW, boot, expectNoHorizontalOverflow } from './ui_fixture.js';

async function openPlan(page) {
  await page.locator('#add-btn').click();
  await page.locator('[data-action="pick-record-mode"][data-mode="plan"]').click();
  await expect(page.getByLabel('结束时间（可选）')).toBeVisible();
  await expect(page.locator('[data-role="log-time-row"]')).toBeHidden();
}

async function savedPlan(page, what) {
  return page.evaluate(text =>
    JSON.parse(localStorage.getItem('timelog.v1')).entries.find(entry => entry.what === text), what);
}

test('saves a planned interval across a reload and displays its duration', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 820 });
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.goto('/');
  await openPlan(page);
  const start = page.locator('[data-role="plan-time-row"] [data-role="text"]');
  await start.fill('2026-06-29 14:30');
  await start.blur();
  await page.getByLabel('结束时间（可选）').fill('16:00');
  await page.locator('#form-what').fill('读文献');
  await page.locator('#form-sheet .sh-done').click();
  await expect(page.locator('#form-sheet')).toBeHidden();
  expect(await savedPlan(page, '读文献')).toMatchObject({
    planned: true, ts: '2026-06-29T14:30', planEndTs: '2026-06-29T16:00'
  });
  await page.reload();
  const card = page.locator('.entry.planned').filter({ hasText: '读文献' });
  await expect(card.locator('.e-time')).toHaveText('14:30–16:00');
  await expect(card.locator('.e-dur')).toHaveText('1h30min');
  await expect(page.locator('#ruler')).toContainText('今日有计划，不计入统计');
});

test('can add and edit an overnight end on a mobile-width plan', async ({ page }) => {
  await boot(page, 390, 'empty', false, FIXED_NOW);
  await openPlan(page);
  await page.getByLabel('结束时间（可选）').fill('01:00');
  await page.locator('#form-what').fill('夜间阅读');
  await page.locator('#form-sheet .sh-done').click();
  const card = page.locator('.entry.planned').filter({ hasText: '夜间阅读' });
  await expect(card.locator('.plan-end-label')).toHaveText('–次日 01:00');
  await expectNoHorizontalOverflow(page);
  await card.click();
  const end = page.getByLabel('结束时间（可选）');
  await expect(end).toHaveValue('01:00');
  await end.fill('02:15');
  await page.locator('#form-sheet .sh-done').click();
  await expect(card.locator('.plan-end-label')).toHaveText('–次日 02:15');
  expect((await savedPlan(page, '夜间阅读')).planEndTs).toBe('2026-06-30T02:15');
  await card.getByRole('button', { name: '标记计划为已发生' }).click();
  const actual = await savedPlan(page, '夜间阅读');
  expect(actual).not.toHaveProperty('planned');
  expect(actual).not.toHaveProperty('planEndTs');
});

test('rejects an equal end and accepts a start-only plan', async ({ page }) => {
  await boot(page, 768, 'empty', false, FIXED_NOW);
  await openPlan(page);
  await page.locator('#form-what').fill('旧式计划');
  const end = page.getByLabel('结束时间（可选）');
  const start = await page.locator('#form-ts').inputValue();
  await end.fill(start.slice(11));
  await page.locator('#form-sheet .sh-done').click();
  await expect(page.locator('#form-plan-end-error')).toBeVisible();
  expect(await savedPlan(page, '旧式计划')).toBeUndefined();
  await end.fill('');
  await page.locator('#form-sheet .sh-done').click();
  await expect(page.locator('.entry.planned').filter({ hasText: '旧式计划' })).toBeVisible();
  expect(await savedPlan(page, '旧式计划')).not.toHaveProperty('planEndTs');
});

test('keeps the complete interval in drafts and after save undo', async ({ page }) => {
  await boot(page, 768, 'empty', false, FIXED_NOW);
  await openPlan(page);
  const start = page.locator('[data-role="plan-time-row"] [data-role="text"]');
  const end = page.getByLabel('结束时间（可选）');
  await start.fill('2026-06-29 15:30');
  await start.blur();
  await end.fill('17:00');
  await page.locator('#form-what').fill('整理笔记');
  await page.locator('#form-sheet .sh-cancel').click();

  await page.locator('#add-btn').click();
  await expect(page.locator('#form-ts')).toHaveValue('2026-06-29T15:30');
  await expect(end).toHaveValue('17:00');
  await page.locator('#form-sheet .sh-done').click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(await savedPlan(page, '整理笔记')).toBeUndefined();

  await page.locator('#add-btn').click();
  await expect(page.locator('#form-what')).toHaveValue('整理笔记');
  await expect(page.locator('#form-ts')).toHaveValue('2026-06-29T15:30');
  await expect(end).toHaveValue('17:00');
});
