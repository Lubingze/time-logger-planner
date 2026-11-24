import { expect, test } from '@playwright/test';
import { FIXED_NOW } from './ui_fixture.js';

async function openDay(page, entries) {
  await page.setViewportSize({ width: 1050, height: 850 });
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.addInitScript(rows => {
    if (!localStorage.getItem('timelog.v1')) {
      localStorage.setItem('timelog.v1', JSON.stringify({ version: 1, entries: rows }));
      localStorage.setItem('timelog.config', JSON.stringify({
        version: 1, mainline: ['当前主线', '学习'], chips: []
      }));
    }
  }, entries);
  await page.goto('/');
}

const storedEntries = page => page.evaluate(() => JSON.parse(localStorage.getItem('timelog.v1')).entries);

test('hides both kinds of gap by default and remembers the reversible choice', async ({ page }) => {
  await openDay(page, [{ id: 'tail', ts: '2026-06-29T11:30', what: '', tags: [] }]);
  const button = page.locator('#timeline-gaps-toggle');
  const gaps = page.locator('#timeline .entry:is(.gap, .placeholder)');
  await expect(button).toHaveText('显示未记录');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(gaps).toHaveCount(0);
  await expect(page.locator('#ruler')).toContainText('未记录');
  const before = await storedEntries(page);
  await button.click();
  await expect(gaps).toHaveCount(2);
  await expect(button).toHaveText('收起未记录');
  await page.reload();
  await expect(gaps).toHaveCount(2);
  await button.click();
  await expect(gaps).toHaveCount(0);
  expect(await storedEntries(page)).toEqual(before);
});

test('editing a tag on an elapsed plan preserves its planned interval', async ({ page }) => {
  const plan = {
    id: 'plan', ts: '2026-06-29T12:00', planEndTs: '2026-06-29T16:00',
    what: '学 Python', tags: ['当前主线'], planned: true
  };
  await openDay(page, [plan]);
  const row = page.locator('.entry.planned');
  await expect(row.locator('.plan-time-range')).toHaveText('12:00–16:00');
  await expect(row.locator('[data-action="confirm-planned"]')).toHaveCount(0);
  await row.locator('.e-tag').click();
  await page.getByRole('button', { name: '选择标签：学习', exact: true }).click();
  await page.locator('#form-sheet .sh-done').click();
  await expect(page.locator('#form-sheet')).toBeHidden();
  await expect(row.locator('.plan-time-range')).toHaveText('12:00–16:00');
  await expect(row.locator('.e-tag')).toHaveText('#学习');
  await expect(page.locator('.now-strip')).toBeHidden();
  expect((await storedEntries(page)).find(entry => entry.id === plan.id)).toEqual({ ...plan, tags: ['学习'] });
});
