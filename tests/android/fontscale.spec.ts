import { execFileSync } from 'node:child_process';
import { _android as android, expect, test, type AndroidDevice, type Page } from '@playwright/test';
import { asRole, clipped, smallTargets, views } from '../helpers/layout';

// Real Chrome on an Android emulator at several system font scales, sized to 320dp.
// The dev server listens on the host's loopback only, so adb reverse forwards the device's 127.0.0.1:5173 to it.
const url = 'http://127.0.0.1:5173';
let device: AndroidDevice;

// Chrome reads the system font scale at process start, so restart it after every change.
const setScale = async (scale: number) => {
  await device.shell(`settings put system font_scale ${scale}`);
  await device.shell('am force-stop com.android.chrome');
};
const paragraphSize = (page: Page) => page.locator('p').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));

test.beforeAll(async () => {
  [device] = await android.devices();
  test.skip(!device, 'no Android device attached');
  execFileSync('adb', ['reverse', 'tcp:5173', 'tcp:5173']);
  await device.shell('wm size 640x1280');
  await device.shell('wm density 320');
});
test.afterAll(async () => {
  if (device) {
    await device.shell('wm size reset');
    await device.shell('wm density reset');
    await setScale(1.0);
  }
  await device?.close();
});

// Chrome on Android applies no text scaling at 1.3 (13px stays 13px); it starts at 1.5.
for (const scale of [1.5, 2.0]) {
  for (const role of ['scheduler', 'faculty'] as const) {
    test(`${role} at Android font scale ${scale}: text grows, nothing clipped, 44px targets`, async () => {
      await setScale(1.0);
      let context = await device.launchBrowser();
      let page = await context.newPage();
      await page.goto(url);
      await page.locator('h1').first().waitFor();
      const base = await paragraphSize(page);
      await context.close();

      await setScale(scale);
      context = await device.launchBrowser();
      page = await context.newPage();
      await page.goto(url);
      await page.locator('h1').first().waitFor();
      expect(await page.evaluate(() => innerWidth)).toBeLessThanOrEqual(321);
      expect(await paragraphSize(page)).toBeGreaterThanOrEqual(base * scale * 0.95);
      expect.soft(await clipped(page), 'clipped on role picker').toEqual([]);
      expect.soft(await smallTargets(page), 'small targets on role picker').toEqual([]);

      await asRole(page, role);
      await page.reload();
      for (const view of views[role]) {
        await page.getByRole('button', { name: new RegExp(`^${view}`) }).click();
        expect.soft(await clipped(page), `clipped on ${view}`).toEqual([]);
        expect.soft(await smallTargets(page), `small targets on ${view}`).toEqual([]);
      }
      if (role === 'scheduler') {
        await page.getByRole('button', { name: /^Course sections/ }).click();
        await page.getByRole('button', { name: 'Review' }).first().click();
        expect.soft(await clipped(page), 'clipped in review dialog').toEqual([]);
        expect.soft(await smallTargets(page), 'small targets in review dialog').toEqual([]);
        await page.keyboard.press('Escape');
      }
      await context.close();
    });
  }
}
