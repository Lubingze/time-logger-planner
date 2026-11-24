// v91：确认长段的写入失败需要向用户显示反馈。
//
// 判据刻意分三层，缺一层这条用例就可能是假的：
//   ① 拦截器真的被调用过（P38 教训：只看用例通过，分不出「保护住了」和「故障压根
//      没注入」）；
//   ② 数据确实没落库（证明我们测的是失败路径，不是成功路径）；
//   ③ 用户看得见反馈——这一层才是本条要守的行为。
import { expect, test } from '@playwright/test';
import { FIXED_NOW, boot } from './ui_fixture.js';

async function rejectDataWrites(page) {
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__blockedWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'timelog.v1') {
        window.__blockedWrites += 1;
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
}

test('v91: 长段确认 reports the failure when local storage is full', async ({ page }) => {
  await boot(page, 768, 'pending-confirm-lunch', false, FIXED_NOW);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await expect(page.locator('[data-action="confirm-segment"]')).toHaveCount(1);
  const before = await page.evaluate(() => localStorage.getItem('timelog.v1'));
  await rejectDataWrites(page);

  await page.locator('[data-action="confirm-segment"]').click();

  expect(await page.evaluate(() => window.__blockedWrites),
    '拦截器必须真的被调用过').toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('timelog.v1')),
    '写入失败后数据必须逐字不变').toBe(before);
  await expect(page.locator('#info-toast'),
    '写入失败必须有可见反馈').toBeVisible();
  await expect(page.locator('#info-toast')).toContainText('存储空间不足');
  expect(pageErrors).toHaveLength(0);
});

// 反向哨兵：存储正常时长段确认成功，且**不得**弹出配额提示。
// 少了它，「让 showInfoToast 无条件弹」也能让上面的用例变绿。
//
// 「没弹提示」必须用**一次性**读取（isVisible），不能用 toBeHidden()：后者会自动
// 重试到超时（默认 5s），而 toast 自己 3s 后就消失——于是它等到 toast 自然过期再
// 判过，无条件弹提示照样全绿。第一版正是这么写的，红灯③点不亮才逮到。
// showInfoToast 在 click 处理器内同步执行，且前面两条断言已经证明处理器跑完了，
// 所以这里不存在「还没来得及出现」的竞态。
async function expectNoToast(page) {
  expect(await page.locator('#info-toast').isVisible(),
    '正常路径不得弹出配额提示').toBe(false);
}

test('v91: confirming a long segment succeeds silently when storage is healthy', async ({ page }) => {
  await boot(page, 768, 'pending-confirm-lunch', false, FIXED_NOW);
  await page.locator('[data-action="confirm-segment"]').click();
  await expect(page.locator('[data-action="confirm-segment"]')).toHaveCount(0);
  await expectNoToast(page);
});
