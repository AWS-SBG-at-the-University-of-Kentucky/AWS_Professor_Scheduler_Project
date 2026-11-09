# QA report: quality and release pass

Tested 2026-11-07 on branch `playwright-multi-browser-setup` (commit `c306290`), macOS, Node 24.20.0, npm 12.2.0, Playwright 1.65.0.
Manual checks were done in Chrome, scripted checks in Playwright Chromium, Firefox and WebKit. Screenshots are in `qa-screenshots/`.

## Demo checklist

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Fresh clone, then `npm ci` | PASS | 45 packages, no vulnerabilities. Warns that `fsevents` install script was blocked (harmless). |
| 2 | `npm run check` (rule tests, type check, build) | PASS | 23/23 rule tests, build succeeds |
| 3 | `npm run test:e2e` (existing suite, 18 runs) | FLAKY | 17/18; Firefox competing-approvals test fails in about 1 of 2 full runs (Issue 5) |
| 4 | Walkthrough step 1: reset, counts 25 / 60 / 19 / 12 | PASS | |
| 5 | Step 2: Maya Chen submits preferences | PASS | Toast shown. Maya was already "Submitted" in the seed, so the step changes nothing visible |
| 6 | Step 3: CS 101 · 002 review, top candidate Elena Petrova | PASS | |
| 7 | Step 4: lower-ranked candidate without a note is blocked | PASS | `02-lower-ranked-needs-note.jpg` (see Issue 3) |
| 8 | Step 4: approve top candidate | PASS | `03-approved.jpg`. One assignment stored |
| 9 | Step 5: Week/List schedule, reload, assignment remains | PASS | `04-persisted-after-reload.jpg` |
| 10 | Step 6: Activity & history shows submission and approval | PASS | Export was not clicked manually (it downloads a file). It is covered by the existing journey test |
| 11 | Invalid input: availability ends before it starts | PASS (blocked, nothing saved) | `01-invalid-time-window.jpg` (see Issue 2) |
| 12 | No-match: CS 499 · 005, Approve disabled | PASS | `05-no-eligible-match.jpg` |
| 13 | Hard-constraint protection: uncheck Maya's Monday | PASS | `07-hard-constraint-blocked.jpg` |
| 14 | Keyboard: skip link, Tab order, dialog focus, Escape, focus returns | PASS (with Issue 2 and 3 focus loss) | `06-focus-ring-clipped.png` (minor) |
| 15 | Narrow width 375px, no page-level sideways scroll | PASS | Tables scroll inside their container (`09-sections-375px.png`) |
| 16 | Narrow width 320px (WCAG reflow width) | FAIL | `08-preferences-320px-clipped.png` (Issue 1) |
| 17 | Colorblind simulation (deuteranopia, protanopia, tritanopia, grayscale) | PASS | All statuses have text labels. `10-sections-grayscale.png` |
| 18 | Text size | FAIL | Issue 4 |

## Highest-priority issues

### 1. End-time fields lose their clock icon at 320px (Low)
- **Steps:** Set the browser width to 320px, choose Professor view, then My preferences.
- **Expected:** Every availability and preferred-hours field, including its clock icon, is fully visible. 320px is the WCAG 2.1 SC 1.4.10 Reflow width, which also equals 1280px zoomed to 400%.
- **Actual:** Each `.time-row` is 321px wide inside a `.panel.time-panel` with `overflow:hidden` that is 282px wide. The "to" end-time inputs are clipped on the right: the time is still readable but the clock icon is cut off, and you can't scroll to it. A quality issue, not a blocker. Fine at 375px.
- **Why the suite misses it:** The mobile test runs at 390px and only checks `document.scrollWidth`. Clipping by `overflow:hidden` never makes the page itself scroll.
- **Screenshot:** `qa-screenshots/08-preferences-320px-clipped.png`

### 2. Preference validation errors don't say which field is wrong, and focus is lost
- **Steps:** Professor view, My preferences, set Tuesday hard-availability end to 08:00 AM, then Submit preferences.
- **Expected:** The error names the day, the bad field is marked (`aria-invalid`, highlighted) and focus moves to it or to the error.
- **Actual:** A generic banner at the top says "Every time window needs a valid start time before its end time." No field is highlighted or marked `aria-invalid`, and focus drops to `<body>`. Keyboard and screen-reader users lose their place. The save is correctly blocked.
- **Related:** The time inputs' accessible names are raw keys such as "available Tue end" (`<label>` text built from the field name).
- **Screenshot:** `qa-screenshots/01-invalid-time-window.jpg`

### 3. Decision note says "Optional" when it is required, and focus is lost on the error
- **Steps:** Scheduler view, Course sections, CS 101 · 002 Review, select Priya Shah (#2), then Approve assignment with the note empty.
- **Expected:** When a lower-ranked candidate is selected, the note is shown as required before you submit. After the error, focus moves to the note field.
- **Actual:** The placeholder still says "Optional context for this assignment…" and the field isn't `required`. After the error the dialog scrolls to the top and focus is on `<body>` while the dialog is still open. Approval is correctly blocked.
- **Screenshot:** `qa-screenshots/02-lower-ranked-needs-note.jpg`

### 4. Most text is 8–12px, and fixed `px` sizes ignore the browser's font-size setting
- **Steps:** Open Course sections. Measure rendered text, then raise the browser's default font size (simulated as root `font-size: 32px`).
- **Expected:** Body text around 14–16px or larger, and text grows when the user raises the browser's default size.
- **Actual:** 564 of 579 text elements on Course sections are under 12px. `styles.css` sets 8px ×4, 9px ×10, 10px ×24 and 11px ×26. A table cell stays at 11px even when the default size is doubled. Page zoom still works. Matches the first-impressions note that "the text is tiny".

**Update (fixed by merging `phone-and-landing`):** Text is now in `rem` and the root size follows iOS Dynamic Type (`font:-apple-system-body`). The old 200% test passed without testing anything (it only changed the root size, which `px` text ignored). It is now two tests (130% and 200% at 320px) that first assert the text really grew, then check clipping and axe. Checked in the iOS Simulator (iPhone 16, Mobile Safari) at accessibility sizes: text scales and the layout wraps. One clipped tagline on the role picker was fixed. Android font scale was checked on an Android 15 emulator (Chrome, 320dp wide) at 1.5 and 2.0: text grows exactly by the scale, no clipped content on any scheduler or faculty view, the role picker or the review dialog, and every tap target is at least 44px (this needed a 44px minimum-height rule in `styles.css`; nav, role select, Reset demo, Export and form fields were 24–39px). Chrome on Android applies no text scaling at 1.3, so that setting looks the same as 1.0. Run with `npm run test:e2e:android` (emulator and dev server running). **Still untested:** a physical iPhone and a physical Android phone.

### 5. Firefox competing-approvals test is flaky (test issue, data is safe)
- **Steps:** Run `npm run test:e2e` (all three browsers together) a few times.
- **Expected:** 18/18 pass.
- **Actual:** `competing review tabs cannot double-approve the same section` fails on Firefox in about half of full runs. The conflict message isn't found, even with the wait raised to 15s. It passed 40/40 when run alone and on Firefox-only runs.
- **Data check:** In 84 instrumented runs across all browsers, storage always held exactly one SEC-002 assignment and one audit entry, so the app's lock and revision check holds. The flaky part is the test reading the conflict message. The root cause wasn't found within the time box.
- **Suggested fix:** Assert the stored assignment count first (the real invariant). Then check the message with `expect(...).toPass()` or by reading each tab's alert separately.

## Lower-priority notes
- **README is out of date:** It says local tests use Microsoft Edge (`channel: 'msedge'`), but `playwright.config.ts` on this branch runs bundled Chromium, Firefox and WebKit.
- **Reload resets the role:** After a reload the app always opens in Scheduler view. DEMO.md accounts for this, but it adds a step to every check.
- **Focus ring clipped:** On "Needs your attention" rows, only the top and bottom edges of the focus outline show; the sides are clipped by the card (`06-focus-ring-clipped.png`).
- **Hidden actions at 375px:** Review and Manage are off-screen in the sections and faculty tables until you scroll the table sideways, with no visual hint that you can.
- **Unchecked days still look editable:** An unchecked availability day keeps its time inputs looking active.

## Test added
New test: `availability window ending before it starts is rejected and not saved` in `tests/browser/journey.spec.ts`. The suite already covered duplicate course ranks but not invalid time windows.

```sh
npx playwright test -g "availability window ending"
#   ✓ [chromium] … (1.1s)
#   ✓ [webkit]   … (1.4s)
#   ✓ [firefox]  … (1.7s)
#   3 passed (3.3s)
```

Checked that it can fail: with the `start >= end` rule removed from `src/matching.ts`, it fails with `Expected substring: "valid start time before its end time"`, `element(s) not found`.

Full suite with the new test: 20 passed, 1 failed (the Issue 5 Firefox flake).

## Accessibility and design checks to keep doing
- Text size: a minimum rendered size (about 14px for body text) and sizes in `rem` so the browser's font-size setting works.
- Reflow at 320px: a test that looks for clipped content, not just page-level scroll.
- Colorblind simulation (Chrome DevTools, Rendering, Emulate vision deficiencies, or CDP `Emulation.setEmulatedVisionDeficiency`).
- Error handling: errors name the field, `aria-invalid` is set, focus moves to the error.
- Focus order, a visible focus ring, and dialog focus on open, close and error.
- Contrast and WCAG A/AA scans (axe, already in the suite). A manual screen-reader pass with VoiceOver.
- Touch target size of at least 24×24px (WCAG 2.2 SC 2.5.8). Scanned at 320/375px: 10 small targets in the review dialog and 11 on Preferences, mostly the checkboxes and radio buttons.

## What could not be done
- **Microsoft Edge:** The clue says local tests use Edge, but this branch's config doesn't use it, so nothing ran in Edge.
- **Narrow width in real Chrome:** The extension couldn't resize the window (it stayed 1470px wide), so narrow-width checks ran in Playwright Chromium at 320 and 375px.
- **CSV export by hand:** Not clicked manually because it downloads a file. It is covered by the existing automated test.
- **Screen reader:** No VoiceOver pass was done. Only automated checks of labels and focus.
- **Firefox flake root cause:** Not identified within the time box (Issue 5).

## AI usage statement
This pass was carried out with an AI assistant (Claude, in Claude Code).

**Done by the AI assistant:**
- Ran the fresh-clone setup, `npm run check` and the browser suite.
- Did the DEMO.md walkthrough and edge cases in Chrome and took the screenshots.
- Scripted the narrow-width, text-size, colorblind and competing-approval checks in Playwright.
- Investigated the Firefox flake.
- Wrote the issues and severity ratings, and wrote and mutation-checked the new browser test.
- Wrote this report and the text and layouts of the accompanying slide deck.

**Provided by Storm:**
- The task card and the request to do it.
- The slide template and severity scale, from an earlier UX review.
- First-impressions notes (`Storm/storms_first_impressions.txt`, the source of the text-size concern).
- Direction to add Chrome screenshots and accessibility checks.

The findings come from real test runs and screenshots taken during this session, but no person has re-run them independently yet. Treat them as a starting point to confirm.
