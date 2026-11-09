import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const asRole = (page: Page, role: 'scheduler' | 'faculty') =>
  page.addInitScript(r => localStorage.setItem('facultyplan.identity', JSON.stringify({ role: r, facultyId: 'FAC-001' })), role);

// Content that pokes outside the viewport and is not inside a deliberate scroller is clipped or unreachable.
async function clipped(page: Page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const bad: string[] = [];
    if (document.documentElement.scrollWidth > width) bad.push('page scrolls sideways');
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('.sr-only, .skip-link, thead')) continue;
      let scroller = false;
      for (let p: HTMLElement | null = el.parentElement; p; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowX)) scroller = true;
      if (!scroller && (box.right > width + 1 || box.left < -1)) bad.push(`${el.tagName.toLowerCase()}.${el.className} ${Math.round(box.left)}..${Math.round(box.right)}`);
    }
    return bad.slice(0, 8);
  });
}
async function smallTargets(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), a[href]')]
    .filter(el => !el.closest('.sr-only, .skip-link, thead') && el.getBoundingClientRect().width > 0)
    .filter(el => el.getBoundingClientRect().height < 43.5)
    .map(el => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().height)}px`).slice(0, 8));
}

test('first visit asks for a role, remembers it, and each home leads with its main task', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Who are you today?' })).toBeVisible();
  await page.getByLabel('Which professor?').selectOption({ label: 'Maya Chen' });
  await page.getByRole('button', { name: /Continue as professor/ }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Maya.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /preferences are (still a draft|submitted)/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, Maya.' })).toBeVisible();
  await page.getByLabel('Demo role').selectOption('scheduler');
  await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();
});

test('professor edits and submits preferences on a phone', async ({ page }) => {
  await asRole(page, 'faculty');
  await page.goto('/');
  await page.getByRole('button', { name: /Finish and submit|Edit preferences/ }).click();
  await page.locator('[name="rank-0"]').selectOption('CS 101');
  await page.getByRole('button', { name: 'Submit preferences' }).click();
  await expect(page.locator('#toast')).toContainText('Preferences submitted');
});

test('scheduler approves a section from a card on a phone', async ({ page }) => {
  await asRole(page, 'scheduler');
  await page.goto('/');
  await page.getByRole('button', { name: /^Course sections/ }).click();
  await page.locator('tr').filter({ hasText: 'CS 101 · 002' }).getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Approve assignment', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Assignment approved');
});

const views = {
  scheduler: ['Overview', 'Course sections', 'Faculty directory', 'Teaching schedules', 'Activity & history'],
  faculty: ['Overview', 'Course sections', 'My preferences', 'My schedule', 'Activity & history'],
} as const;
for (const role of ['scheduler', 'faculty'] as const) {
  test(`${role} views have no clipped content and 44px targets at phone width`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await asRole(page, role);
    await page.goto('/');
    for (const view of views[role]) {
      await page.getByRole('button', { name: new RegExp(`^${view}`) }).click();
      expect.soft(await clipped(page), `clipped on ${view}`).toEqual([]);
      expect.soft(await smallTargets(page), `small targets on ${view}`).toEqual([]);
    }
  });
}

test('everything still works at 200% text size on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await asRole(page, 'scheduler');
  await page.goto('/');
  await page.addStyleTag({ content: 'html{font-size:200% !important}' });
  for (const view of views.scheduler) {
    await page.getByRole('button', { name: new RegExp(`^${view}`) }).click();
    expect.soft(await clipped(page), `clipped on ${view} at 200%`).toEqual([]);
  }
  await page.getByRole('button', { name: /^Course sections/ }).click();
  await page.getByRole('button', { name: 'Review' }).first().click();
  await expect(page.getByRole('button', { name: 'Approve assignment', exact: true })).toBeVisible();
  expect(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze().then(r => r.violations.map(v => v.id))).toEqual([]);
});
