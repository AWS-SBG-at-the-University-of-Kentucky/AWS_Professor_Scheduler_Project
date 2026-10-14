# Demonstration and AWS handoff

## Five-minute walkthrough

1. Start the app and select **Reset demo → Reset demo data**. The scheduler sees 25 faculty, 60 sections, 19 submitted preferences, and 12 approved assignments.
2. Choose **Professor view**, select **Maya Chen**, and open **My preferences**. Keep the initial rankings and availability, then choose **Submit preferences**.
3. Switch to **Scheduler view** and open **Course sections**. Find **CS 101 · 002**, click **Review**, and read the ranking explanations. The initial top candidate is **Elena Petrova**.
4. Approve the top candidate. Selecting a different eligible candidate requires a decision note. Approval updates the assignment, credit load, and history together.
5. Switch to **Professor view**, choose the professor just assigned, and open **My schedule**. Compare Week and List. Reload, select the professor again, and confirm the assignment remains.
6. Return to Scheduler view and export assignments. Open Activity & history to find the preference submission and approval.

## Useful edge cases

- **No eligible match:** Overview → Early-morning capstone. The seeded CS 499 · 005 meets at 07:00, outside all faculty availability. Approval is disabled.
- **Duplicate preference:** Choose the same course twice, then submit. An inline error explains the correction.
- **Hard-constraint protection:** Maya has an approved Monday/Wednesday/Friday 09:00 class. Uncheck Monday availability and save; the edit must be blocked.
- **Competing approvals:** Open the same unassigned section’s review in two tabs. Approve in one, then the other. The second gets a conflict and a button to reload current details.
- **Recoverable failure:** Demo walkthrough → Simulate next save failure. The next save fails without modifying data. Retry the save successfully.
- **Remove assignment:** Manage an approved section, enter a removal reason, and remove. The professor’s schedule and history update together.
- **Faculty administration:** Try reducing an assigned professor’s capacity below their assigned credits. The edit is blocked. A valid increase is saved.
- **Storage recovery:** Corrupting the demo storage manually produces a recovery screen on reload. Reset restores the seed. Avoid real data in this browser store.

## Verification

`npm run check` verifies the rule suite, strict TypeScript compilation, and static production build. `npm run test:e2e` covers the complete journey, real same-browser competing approvals, failure/retry, admin edits, empty search, mobile overflow, keyboard skip navigation, and automated WCAG A/AA scans on the main views. Automated scans do not replace a manual accessibility review.

## AWS implementation gate

The project plan requires prototype review before AWS implementation and a cost estimate before provisioning. This prototype implements that review milestone; successful AWS CLI authentication is independent of the frontend.

Before the hosted POC:

1. Review and accept the prototype and settle remaining university-specific rules. The current one-window-per-day form is an explicit prototype simplification.
2. Establish an OpenAPI contract with role-scoped responses. Preserve the shared TypeScript domain and matching rules. Faculty must receive only their own private preferences and assignments.
3. Estimate hosting, private PostgreSQL, storage, interface endpoints, Secrets Manager, logs, DNS, and other supporting services against the $50/month target. Configure alerts at $25/$40/$50. Do not count on alerts to cap spending.
4. Use an individual IAM identity or role for implementation. Use Cognito authorization-code login with PKCE for application users; no AWS access keys go into browser code or the repository.
5. Build the TypeScript CDK environment in us-east-1, versioned SQL migrations, repeatable seeds, and Lambda/API adapter. Amplify supplies frontend CloudFront delivery. Use private RDS and the planned Secrets Manager interface endpoint.
6. Serialize approvals by locking the affected faculty and section in a database transaction, rereading assignments and eligibility, and atomically writing the assignment and audit event. Also coordinate faculty/preference/section changes that can affect eligibility; browser locks are not a substitute for database transactions.
7. Re-run shared fixtures against local and Lambda execution, then test server authorization, real concurrent requests, expired Cognito sessions, deployment/recovery, and teardown before release.

## Local cleanup

Stop the Vite process with Ctrl+C. Reset demo clears changes on the current origin. `dist/`, `test-results/`, and `playwright-report/` are generated and ignored by Git. This project creates no AWS resources during local setup, build, tests, or preview.
