import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Seed data: FAC-001 (Maya Chen) has submitted preferences; FAC-020 (Owen Davis) is still a draft.
const DRAFT = { id: 'FAC-020', name: 'Owen Davis' };
const SUBMITTED = { id: 'FAC-001', name: 'Maya Chen' };

// Sets the stored identity on first load only, so later role changes survive a reload.
const storeIdentity = (page: Page, role: 'scheduler' | 'faculty', facultyId: string) =>
  page.addInitScript(([r, id]) => { if (!localStorage.getItem('facultyplan.identity')) localStorage.setItem('facultyplan.identity', JSON.stringify({ role: r, facultyId: id })); }, [role, facultyId]);

async function expectPreferencesPage(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Your semester, your preferences.' })).toBeVisible();
  await expect(page).toHaveTitle('My preferences · FacultyPlan');
  await expect(page.getByRole('button', { name: 'My preferences', exact: true })).toHaveAttribute('aria-current', 'page');
}
async function expectProfessorOverview(page: Page, firstName: string) {
  await expect(page.getByRole('heading', { level: 1, name: `Welcome, ${firstName}.` })).toBeVisible();
  await expect(page).toHaveTitle('Overview · FacultyPlan');
}

test.describe('professor landing page', () => {
  test('a draft professor lands on My preferences from the welcome screen, the role selector and a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Which professor?').selectOption({ label: DRAFT.name });
    await page.getByRole('button', { name: /Continue as professor/ }).click();
    await expectPreferencesPage(page);
    await expect(page.locator('#main')).toBeFocused();

    await page.reload();
    await expectPreferencesPage(page);

    await page.getByLabel('Demo role').selectOption('scheduler');
    await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();
    await page.getByLabel('Demo role').selectOption('faculty');
    await expectPreferencesPage(page);
  });

  test('switching professors keeps the current page', async ({ page }) => {
    await storeIdentity(page, 'faculty', DRAFT.id);
    await page.goto('/');
    await expectPreferencesPage(page);
    await page.getByLabel('Demo professor').selectOption({ label: SUBMITTED.name });
    await expectPreferencesPage(page);
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.getByLabel('Demo professor').selectOption({ label: DRAFT.name });
    await expectProfessorOverview(page, 'Owen');
  });

  test('a submitted professor lands on the overview from the welcome screen, the role selector and a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Which professor?').selectOption({ label: SUBMITTED.name });
    await page.getByRole('button', { name: /Continue as professor/ }).click();
    await expectProfessorOverview(page, 'Maya');
    await expect(page.getByRole('heading', { name: 'Your preferences are submitted.' })).toBeVisible();

    await page.reload();
    await expectProfessorOverview(page, 'Maya');

    await page.getByLabel('Demo role').selectOption('scheduler');
    await page.getByLabel('Demo role').selectOption('faculty');
    await expectProfessorOverview(page, 'Maya');
  });

  test('a draft professor who submits lands on the overview next time', async ({ page }) => {
    await storeIdentity(page, 'faculty', DRAFT.id);
    await page.goto('/');
    await expectPreferencesPage(page);
    await page.getByRole('button', { name: 'Submit preferences' }).click();
    await expect(page.locator('#toast')).toContainText('Preferences submitted');
    await page.reload();
    await expectProfessorOverview(page, 'Owen');
  });

  test('the scheduler lands on the overview from the welcome screen, the role selector and a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Continue as scheduler/ }).click();
    await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();
    await expect(page).toHaveTitle('Overview · FacultyPlan');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();

    // Even when the remembered professor is a draft, the scheduler still starts on the overview.
    await page.getByLabel('Demo role').selectOption('faculty');
    await page.getByLabel('Demo professor').selectOption({ label: DRAFT.name });
    await page.getByLabel('Demo role').selectOption('scheduler');
    await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();
  });
});

test.describe('demo walkthrough', () => {
  test('the welcome callout sits above the role cards and opens the guide', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Who are you today?' })).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(v => v.id)).toEqual([]);
    // Combining getByRole('region') with axe crashes the page in Playwright's Firefox, so find the callout by class.
    const callout = page.locator('.walkthrough-callout');
    await expect(callout.getByRole('heading', { name: 'New here?' })).toBeVisible();
    const open = callout.getByRole('button', { name: 'Take the 2-minute walkthrough' });
    await expect(open).toBeVisible();
    const calloutBox = (await callout.boundingBox())!, cardsBox = (await page.locator('.role-cards').boundingBox())!;
    expect(calloutBox.y + calloutBox.height).toBeLessThanOrEqual(cardsBox.y);

    // Use the keyboard: WebKit does not focus buttons on click, so there would be no focus to return to.
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Try the complete journey' })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(open).toBeFocused();

    // Opening it here counts, so the sidebar does not highlight it again.
    await page.getByRole('button', { name: /Continue as scheduler/ }).click();
    await expect(page.getByRole('button', { name: 'Demo walkthrough', exact: true })).toBeVisible();
    await expect(page.locator('.start-here')).toHaveCount(0);
  });

  test('the sidebar highlights the walkthrough until it is opened, across reloads and demo resets', async ({ page }) => {
    await storeIdentity(page, 'scheduler', 'FAC-001');
    await page.goto('/');
    const highlighted = page.getByRole('button', { name: 'Demo walkthrough, start here', exact: true });
    await expect(highlighted).toBeVisible();
    await expect(highlighted.getByText('Start here')).toBeVisible();
    // The compact top bar button is for phones only.
    await expect(page.locator('.topbar-guide')).toBeHidden();
    await page.reload();
    await expect(highlighted).toBeVisible();

    await highlighted.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Try the complete journey' })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    const plain = page.getByRole('button', { name: 'Demo walkthrough', exact: true });
    await expect(plain).toBeFocused();
    await expect(page.locator('.start-here')).toHaveCount(0);
    await expect(plain).not.toHaveClass(/guide-new/);

    await page.reload();
    await expect(plain).toBeVisible();
    await expect(page.locator('.start-here')).toHaveCount(0);

    await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await expect(page.locator('#toast')).toContainText('Demo reset');
    await expect(plain).toBeVisible();
    await page.reload();
    await expect(plain).toBeVisible();
    await expect(page.locator('.start-here')).toHaveCount(0);
  });

  test('the walkthrough never opens by itself', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Who are you today?' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /Continue as scheduler/ }).click();
    await expect(page.getByRole('heading', { name: 'Sections to assign.' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
