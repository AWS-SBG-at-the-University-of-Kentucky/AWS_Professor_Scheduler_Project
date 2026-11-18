import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Existing journeys start as the scheduler; the role picker has its own test in mobile.spec.ts.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { if (!localStorage.getItem('facultyplan.identity')) localStorage.setItem('facultyplan.identity', JSON.stringify({ role: 'scheduler', facultyId: 'FAC-001' })); });
});
test('professor preferences → scheduler approval → persisted professor schedule → CSV and removal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true });
  await page.getByLabel('Demo role').selectOption('faculty');
  await page.getByRole('button', { name: 'My preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Submit preferences' }).click();
  await expect(page.locator('#toast')).toContainText('Preferences submitted');
  await page.getByLabel('Demo role').selectOption('scheduler');
  await page.getByRole('button', { name: 'Course sections', exact: false }).click();
  const row = page.getByRole('row').filter({ hasText: 'CS 101 · 002' });
  await row.getByRole('button', { name: 'Review' }).click();
  await page.screenshot({ path: 'test-results/recommendations-desktop.png', fullPage: true });
  const selectedName = (await page.locator('.candidate').filter({ has: page.locator('input:checked') }).locator('.candidate-detail > strong').innerText()).replace('Top match', '').trim();
  await page.getByRole('button', { name: 'Approve assignment', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Assignment approved');
  await page.reload();
  await page.getByLabel('Demo role').selectOption('faculty');
  await page.getByLabel('Demo professor').selectOption({ label: selectedName });
  await page.getByRole('button', { name: 'My schedule', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'CS 101 · 002' })).toBeVisible();
  await page.getByLabel('Demo role').selectOption('scheduler');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export assignments' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('facultyplan-spring-2027.csv');
  await page.getByRole('button', { name: 'Course sections', exact: false }).click();
  await row.getByRole('button', { name: 'Manage' }).click();
  await page.getByLabel('Reason for removing this assignment').fill('Demo reassignment');
  await page.getByRole('button', { name: 'Remove assignment', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('Assignment removed');
  await page.getByRole('button', { name: 'Activity & history' }).click();
  await expect(page.getByText('Demo reassignment', { exact: false })).toBeVisible();
});
test('validation, recoverable failure, no-match and reset', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Early-morning capstone', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'No eligible match' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve assignment' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Demo role').selectOption('faculty');
  await page.getByRole('button', { name: 'My preferences', exact: true }).click();
  await page.locator('[name="rank-0"]').selectOption('CS 101');
  await page.locator('[name="rank-1"]').selectOption('CS 101');
  await page.getByRole('button', { name: 'Submit preferences' }).click();
  await expect(page.getByRole('alert')).toContainText('only once');
  await page.locator('[name="rank-1"]').selectOption('CS 220');
  await page.getByRole('button', { name: 'Demo walkthrough' }).click();
  await page.getByRole('button', { name: 'Simulate next save failure' }).click();
  await page.getByRole('button', { name: 'Submit preferences' }).click();
  await expect(page.getByRole('alert')).toContainText('Simulated connection failure');
  await page.getByRole('button', { name: 'Submit preferences' }).click();
  await expect(page.locator('#toast')).toContainText('Preferences submitted');
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await expect(page.locator('#toast')).toContainText('Demo reset');
});
test('availability window ending before it starts is rejected and not saved', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Demo role').selectOption('faculty');
  await page.getByRole('button', { name: 'My preferences', exact: true }).click();
  await page.locator('[name="available-Tue-end"]').fill('08:00');
  await page.getByRole('button', { name: 'Submit preferences' }).click();
  await expect(page.getByRole('alert')).toContainText('valid start time before its end time');
  await page.reload();
  await page.getByLabel('Demo role').selectOption('faculty');
  await page.getByRole('button', { name: 'My preferences', exact: true }).click();
  await expect(page.locator('[name="available-Tue-end"]')).toHaveValue('16:00');
});
test('competing review tabs cannot double-approve the same section', async ({ page, context }) => {
  const other = await context.newPage();
  for (const tab of [page, other]) {
    await tab.goto('/');
    await tab.getByRole('button', { name: 'Course sections', exact: false }).click();
    await tab.getByRole('row').filter({ hasText: 'CS 101 · 002' }).getByRole('button', { name: 'Review' }).click();
  }
  await Promise.all([page, other].map(tab => tab.getByRole('button', { name: 'Approve assignment', exact: true }).click()));
  await expect.poll(async () => [await page.getByRole('alert').allTextContents(), await other.getByRole('alert').allTextContents()].flat().join(' ')).toContain('out of date');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('facultyplan.demo.v1')!));
  expect(saved.assignments.filter((a: { sectionId: string }) => a.sectionId === 'SEC-002')).toHaveLength(1);
});
test('mobile layout, keyboard navigation and empty searches', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/overview-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Safari only tabs to links with Option+Tab unless the user changes a setting.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.getByRole('button', { name: 'Course sections', exact: false }).click();
  await page.getByLabel('Meeting days').selectOption('tth');
  await page.getByLabel('Search sections').fill('There is no such course');
  await expect(page.getByRole('heading', { name: 'No sections found' })).toBeVisible();
  await expect(page.locator('.empty')).toContainText('No sections match search “There is no such course” and Days: Tue-Thu.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.empty').getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.result-count')).toHaveText('60 sections');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('Demo role').selectOption('faculty');
  await page.getByRole('button', { name: 'My preferences', exact: true }).click();
  await page.screenshot({ path: 'test-results/preferences-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('section search matches days, times, professors and displayed labels; filters combine and clear', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Course sections', exact: false }).click();
  const search = page.getByLabel('Search sections');
  const rows = page.locator('tbody tr');
  const count = page.locator('.result-count');
  const clear = page.locator('.table-toolbar').getByRole('button', { name: 'Clear filters' });
  await expect(count).toHaveText('60 sections');
  await expect(clear).toHaveCount(0);
  // The search icon sits inside the input's left padding, not over the text.
  const padding = await search.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
  const iconRight = await page.locator('.search-input .icon').evaluate(el => el.getBoundingClientRect().right - el.parentElement!.getBoundingClientRect().left);
  expect(padding).toBeGreaterThan(iconRight);

  await search.fill('Tue');
  await expect(count).toHaveText('24 sections');
  for (const text of await rows.locator('.meeting').allInnerTexts()) expect(text).toContain('Tue');
  await search.fill('09:00');
  await expect(rows.first()).toContainText('09:00');
  await search.fill('Maya');
  await expect(count).toHaveText('1 section');
  await expect(rows).toContainText(['CS 101 · 001']);
  await search.fill('CS 101 · 002');
  await expect(count).toHaveText('1 section');
  await expect(rows).toContainText(['CS 101 · 002']);
  await search.fill('cs 101   002');
  await expect(count).toHaveText('1 section');
  await expect(search).toBeFocused();
  await expect(clear).toBeVisible();

  await search.fill('');
  await expect(clear).toHaveCount(0);
  await page.getByLabel('Meeting days').selectOption('mwf');
  await expect(page.getByLabel('Meeting days')).toBeFocused();
  await expect(count).toHaveText('36 sections');
  for (const text of await rows.locator('.meeting').allInnerTexts()) { expect(text).toContain('Mon / Wed / Fri'); expect(text).not.toContain('Tue'); }
  await page.getByLabel('Start time').selectOption('afternoon');
  await expect(page.getByLabel('Start time')).toBeFocused();
  for (const text of await rows.locator('.meeting').allInnerTexts()) expect(Number(text.match(/(\d\d):\d\d/)![1])).toBeGreaterThanOrEqual(12);
  await page.getByLabel('Section status').selectOption('unassigned');
  await search.fill('CS 101');
  await expect(rows).not.toHaveCount(0);

  await clear.click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(page.getByLabel('Section status')).toHaveValue('all');
  await expect(page.getByLabel('Meeting days')).toHaveValue('all');
  await expect(page.getByLabel('Start time')).toHaveValue('any');
  await expect(count).toHaveText('60 sections');
  await expect(clear).toHaveCount(0);

  // Filters are page state: leaving the page resets them.
  await page.getByLabel('Meeting days').selectOption('tth');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Course sections', exact: false }).click();
  await expect(page.getByLabel('Meeting days')).toHaveValue('all');
});
test('main views and recommendation dialog pass automated accessibility checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();
  const check = async () => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target), detail: v.nodes[0]?.failureSummary }))).toEqual([]);
  };
  await check();
  await page.getByRole('button', { name: 'Course sections', exact: false }).click();
  await check();
  await page.getByRole('row').filter({ hasText: 'CS 101 · 002' }).getByRole('button', { name: 'Review' }).click();
  await check();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Faculty directory' }).click();
  await check();
  await page.getByRole('button', { name: 'Teaching schedules' }).click();
  await check();
  await page.getByRole('button', { name: 'Activity & history' }).click();
  await check();
  await page.getByLabel('Demo role').selectOption('faculty');
  await check();
  await page.getByRole('button', { name: 'My preferences', exact: true }).click();
  await check();
});
test('faculty and section administration persists and protects assigned faculty', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Faculty directory' }).click();
  await page.getByRole('row').filter({ hasText: 'Maya Chen' }).getByRole('button', { name: 'Manage' }).click();
  await page.getByLabel('Maximum teaching load').fill('0');
  await page.getByRole('button', { name: 'Save faculty' }).click();
  await expect(page.getByRole('alert')).toContainText('Remove affected assignments');
  await page.getByLabel('Maximum teaching load').fill('9');
  await page.getByRole('button', { name: 'Save faculty' }).click();
  await expect(page.locator('#toast')).toContainText('Faculty qualifications and capacity saved');
  await page.getByRole('button', { name: 'Course sections', exact: false }).click();
  await page.getByRole('row').filter({ hasText: 'CS 101 · 001' }).getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('button', { name: 'Edit section information' }).click();
  await page.getByLabel('Room', { exact: true }).fill('Science 210');
  await page.getByRole('button', { name: 'Save section' }).click();
  await expect(page.locator('#toast')).toContainText('Section information saved');
  await page.reload();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('facultyplan.demo.v1')!));
  expect(data.faculty[0].maxCredits).toBe(9);
  expect(data.sections[0].room).toBe('Science 210');
});
