import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { if (!localStorage.getItem('facultyplan.identity')) localStorage.setItem('facultyplan.identity', JSON.stringify({ role: 'scheduler', facultyId: 'FAC-001' })); });
});

test('review buttons, the sections table and the page title name what they act on', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Overview · FacultyPlan');
  await expect(page.getByRole('button', { name: 'Review CS 101 section 002' })).toBeVisible();
  await page.getByRole('button', { name: /^Course sections/ }).click();
  await expect(page).toHaveTitle('Course sections · FacultyPlan');
  await expect(page.getByRole('table', { name: 'Course sections' })).toBeVisible();
});

test('candidate radios read as separate phrases, without initials or run-together numbers', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Review CS 101 section 002' }).click();
  const radio = page.getByRole('radio').first();
  await expect(radio).toHaveAccessibleName(/^Rank 1 of \d+\. \S+ \S+ Top match ?\. Course preference #1 ?\. /);
  await expect(page.locator('.candidate .avatar').first()).toHaveAttribute('aria-hidden', 'true');
});

test('a missing decision note marks the field invalid, links the error and moves focus', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Review CS 101 section 002' }).click();
  await page.getByRole('radio').nth(2).check();
  await page.getByRole('button', { name: 'Approve assignment' }).click();
  const note = page.locator('#approval-reason');
  await expect(note).toBeFocused();
  await expect(note).toHaveAttribute('aria-invalid', 'true');
  const errorId = await note.getAttribute('aria-describedby');
  await expect(page.locator(`#${errorId}`)).toContainText('lower-ranked');
  await note.fill('x');
  await expect(note).not.toHaveAttribute('aria-invalid', 'true');
});

test('availability and preferred-hours checkboxes have distinct names', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Demo role').selectOption('faculty');
  await page.getByRole('button', { name: 'My preferences', exact: true }).click();
  await expect(page).toHaveTitle('My preferences · FacultyPlan');
  await expect(page.getByRole('checkbox', { name: 'Available Mon' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Preferred Mon' })).toBeVisible();
});

test('role picker logo is not a link and the title resets', async ({ context, page }) => {
  await context.clearCookies();
  await page.addInitScript(() => localStorage.removeItem('facultyplan.identity'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Who are you today?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'FacultyPlan' })).toHaveCount(0);
  await expect(page).toHaveTitle('FacultyPlan · Professor Scheduler');
});

test('section editor day checkboxes are named "Meeting", not "Preferred"', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Review CS 101 section 002' }).click();
  await page.getByRole('button', { name: 'Edit section information' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: 'Meeting Tue' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Meeting Thu' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /Preferred|Available/ })).toHaveCount(0);
  await expect(dialog.getByLabel('meeting Tue start')).toBeVisible();
});
