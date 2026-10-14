# AWS Professor Scheduler · FacultyPlan

An interactive local prototype for a fictional Computer Science department. Professors submit preferences; a scheduler reviews explainable recommendations and approves individual assignments.

## Run the prototype

Prerequisite: Node.js 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. Use the role selector at the top to switch between scheduler and professor views. The initial view is the scheduler dashboard. **Demo walkthrough** provides an in-app guide. On Windows PowerShell, use `npm.cmd` if the local execution policy blocks `npm.ps1`.

```sh
npm run check       # Rule tests, TypeScript checking, and production build
npm run test:e2e    # Browser journey, concurrency, mobile, and accessibility checks
npm run preview    # Serve built dist/ output on http://127.0.0.1:4173/
```

Local browser tests use installed Microsoft Edge. CI installs Playwright Chromium. To use Chromium locally instead, remove the local `channel: 'msedge'` choice in `playwright.config.ts` and run `npx playwright install chromium`.

## Included

- Responsive scheduler and professor dashboards, searchable section browser, and faculty directory.
- Repeatable synthetic dataset: **25 faculty, 12 courses, 60 sections, one semester**, with 12 initial approved assignments.
- Course rankings, separate hard availability and preferred day/time windows, save draft, and submit.
- Deterministic eligibility/ranking with explanations and a deliberate no-match example.
- Approvals that recheck hard constraints, reasons for lower-ranked selections, and removal with a required reason.
- Scheduler administration of faculty qualifications, maximum credit loads, section rooms/seats, and fixed meeting times.
- Weekly schedule and accessible list alternative, audit history, and CSV export.
- Browser-local persistence, Reset demo, loading/empty/validation/conflict/storage failure messages, and a simulated recoverable save failure.
- Same-origin Web Locks and state revisions to serialize writes and reject stale approvals across browser tabs.

## Matching rules

Eligibility requires qualification, coverage of every meeting by hard availability, no overlap with approved assignments, remaining capacity in credit hours, and an unassigned section. Adjacent meetings do not overlap.

Eligible candidates are ordered lexicographically by course preference rank (unranked last), number of meetings outside preferred windows, fraction of teaching capacity already assigned, and faculty ID. Draft preferences are usable and labeled in review; submission is not an additional eligibility constraint. A recommendation never reserves a section.

Availability, qualification, capacity, and section edits that would invalidate an existing assignment are blocked until the affected assignment is removed. Meeting times use America/New_York; audit timestamps use UTC.

## Code organization

| Area | Entry point |
| --- | --- |
| Shared domain types | `src/domain.ts` |
| Pure eligibility, ranking, and validation | `src/matching.ts` |
| Repeatable synthetic data | `src/seed.ts` |
| Data adapter, command validation, local transactions, CSV | `src/store.ts` |
| Screens and interactions | `src/main.ts`, `src/styles.css` |
| Rule and browser tests | `tests/` |

`DataAdapter` separates asynchronous persistence from presentation. The pure rules have no browser dependencies and can be compiled for Lambda. The current adapter returns the entire synthetic department to support role switching; a future authenticated API adapter must use role-scoped responses rather than expose that snapshot to faculty.

## Prototype boundaries

This is a **local HTML/CSS/TypeScript prototype**, compiled to static HTML/CSS/JavaScript by Vite. It is not yet the hosted AWS POC. No Cognito, API Gateway, Lambda, RDS, CDK deployment, or university integration is provisioned by these scripts. AWS credentials are not read by the frontend or included in its bundle.

Demo identity and authorization checks are for workflow simulation. All synthetic records remain inspectable through browser developer tools. Real authentication, server authorization, PostgreSQL transactions, and database audit durability must be implemented during the AWS phase. Browser locks protect only tabs on the same browser origin, not separate browsers or devices.

Use localhost or HTTPS in a modern browser. Browser data is specific to the origin and is not shared with teammates. The prototype form offers one availability window and one preferred window per weekday; the matching module supports multiple contiguous windows. Reset demo restores data; it does not change AWS resources. Google Fonts are optional presentation assets; system fonts provide a fallback.

## Demo and AWS handoff

See [the demo and handoff guide](docs/DEMO.md) for the repeatable walkthrough, expected outcomes, and the AWS implementation gate. There are no recurring AWS costs or teardown steps for this local prototype.
