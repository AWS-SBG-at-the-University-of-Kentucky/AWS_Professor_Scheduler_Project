import type { Page } from '@playwright/test';

export const asRole = (page: Page, role: 'scheduler' | 'faculty') =>
  page.addInitScript(r => localStorage.setItem('facultyplan.identity', JSON.stringify({ role: r, facultyId: 'FAC-001' })), role);

// Content that pokes outside the viewport and is not inside a deliberate scroller is clipped or unreachable.
export async function clipped(page: Page) {
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
export async function smallTargets(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), a[href]')]
    .filter(el => !el.closest('.sr-only, .skip-link, thead') && el.getBoundingClientRect().width > 0)
    .filter(el => el.getBoundingClientRect().height < 43.5)
    .map(el => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().height)}px`).slice(0, 8));
}


export const views = {
  scheduler: ['Overview', 'Course sections', 'Faculty directory', 'Teaching schedules', 'Activity & history'],
  faculty: ['Overview', 'Course sections', 'My preferences', 'My schedule', 'Activity & history'],
} as const;
