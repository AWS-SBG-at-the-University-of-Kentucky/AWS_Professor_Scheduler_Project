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
  // Maya's preferences are already submitted, so she starts on the overview; draft professors start on My preferences.
  await expect(page.getByRole('heading', { name: 'Welcome, Maya.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your preferences are submitted.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, Maya.' })).toBeVisible();
  await page.getByLabel('Demo role').selectOption('scheduler');
  await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();
});

test('a draft professor starts on My preferences on a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Which professor?').selectOption({ label: 'Owen Davis' });
  await page.getByRole('button', { name: /Continue as professor/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your semester, your preferences.' })).toBeVisible();
  expect(await clipped(page)).toEqual([]);
});

test('the walkthrough callout leads the welcome screen and fits a phone', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Take the 2-minute walkthrough' });
  await expect(open).toBeVisible();
  expect((await open.boundingBox())!.y).toBeLessThan((await page.locator('.role-cards').boundingBox())!.y);
  expect(await clipped(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  await open.click();
  await expect(page.getByRole('dialog', { name: 'Try the complete journey' })).toBeVisible();
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

test('the top bar walkthrough button opens the guide on a phone and stops highlighting once opened', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('facultyplan.identity')) localStorage.setItem('facultyplan.identity', JSON.stringify({ role: 'faculty', facultyId: 'FAC-001' })); });
  await page.goto('/');
  const fresh = page.locator('.topbar').getByRole('button', { name: 'Demo walkthrough, start here', exact: true });
  await expect(fresh).toBeVisible();
  const box = (await fresh.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  // Keyboard activation, so every engine has a focused button for the dialog to return to.
  await fresh.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Try the complete journey' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const seen = page.locator('.topbar').getByRole('button', { name: 'Demo walkthrough', exact: true });
  await expect(seen).toBeFocused();
  await page.reload();
  await expect(seen).toBeVisible();
  await expect(page.locator('.start-here')).toHaveCount(0);
  await seen.click();
  await expect(page.getByRole('dialog', { name: 'Try the complete journey' })).toBeVisible();
});

for (const width of [320, 390]) {
  for (const role of ['scheduler', 'faculty'] as const) {
    test(`the ${role} top bar fits at ${width}px with nothing overlapping`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await asRole(page, role);
      await page.goto('/');
      await expect(page.locator('.topbar').getByRole('button', { name: /^Demo walkthrough/ })).toBeVisible();
      expect(await clipped(page)).toEqual([]);
      expect(await smallTargets(page)).toEqual([]);
      const overlaps = await page.locator('.identity-controls').evaluate(bar => {
        const boxes = [...bar.querySelectorAll<HTMLElement>('select, button, .avatar')].map(el => ({ name: el.id || el.className, r: el.getBoundingClientRect() }));
        const hits: string[] = [];
        boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => { if (a.r.left < b.r.right - 0.5 && b.r.left < a.r.right - 0.5 && a.r.top < b.r.bottom - 0.5 && b.r.top < a.r.bottom - 0.5) hits.push(`${a.name} × ${b.name}`); }));
        return hits;
      });
      expect(overlaps).toEqual([]);
    });
  }
}

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

for (const scale of [130, 200]) {
  test(`everything still works at ${scale}% text size on a narrow screen`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await asRole(page, 'scheduler');
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    // Text must track the root size. Compare against it, since iOS WebKit derives its own root size from Dynamic Type.
    const ratios = () => page.evaluate(() => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const size = (sel: string) => parseFloat(getComputedStyle(document.querySelector(sel)!).fontSize);
      return { root, h1: size('h1') / root, p: size('p') / root };
    });
    const before = await ratios();
    await page.addStyleTag({ content: `html{font-size:${scale}% !important}` });
    const after = await ratios();
    // px-sized text ignores the root size, which is how this test once passed without testing anything.
    expect(after.root).toBeGreaterThan(before.root);
    expect(after.h1).toBeCloseTo(before.h1, 1);
    expect(after.p).toBeCloseTo(before.p, 1);
    for (const view of views.scheduler) {
      await page.getByRole('button', { name: new RegExp(`^${view}`) }).click();
      expect.soft(await clipped(page), `clipped on ${view} at ${scale}%`).toEqual([]);
    }
    await page.getByRole('button', { name: /^Course sections/ }).click();
    await page.getByRole('button', { name: 'Review' }).first().click();
    await expect(page.getByRole('button', { name: 'Approve assignment', exact: true })).toBeVisible();
    expect(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze().then(r => r.violations.map(v => v.id))).toEqual([]);
  });
}
