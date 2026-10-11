# Focused real authentication verification — 2026-10-11

## Final email workflow retest — PASS

This retest supersedes the email blockers recorded below. Brevo SMTP key unauthorized-IP blocking was disabled by the project owner after the provider returned `525 5.7.1 Unauthorized IP address`. No SMTP or DKIM settings were changed during testing.

Only the two previously blocked workflows were retested against the actual local React/Express application and existing Supabase project. The disposable account was created through the public signup UI, not through administrative confirmation.

| Workflow | Result | Evidence |
| --- | --- | --- |
| Signup → delivered confirmation → verify → login | **PASS** | Signup API returned 201. Gmail received “Confirm Your Signup” at 18:11:00 UTC on October 11. The actual delivered link, including its Brevo tracking redirect, reached the existing Supabase project and landed on `http://localhost:5173/login`. Supabase `email_confirmed_at` was populated. UI login returned 200 and reached `/dashboard`. |
| Forgot password → delivered recovery → reset → new login | **PASS** | Recovery API returned 200. Gmail received “Reset Your Password” at 18:12:07 UTC. Its real delivered link reached Supabase and landed on `http://localhost:5173/reset-password`. Password update returned 200; login with the new password returned 200 and reached `/dashboard`. The old password returned 401. |

The confirmation email arrived in Inbox; the recovery email arrived in Spam. This is a deliverability finding, not a failure to send or reset. DKIM remains intentionally deferred. Production-domain redirect behavior was not tested; these checks verify the configured local redirects.

The exact disposable Auth identity was deleted after testing and the associated profile was verified absent. Passwords, email-link secrets and tokens are not stored in this report. No unrelated application changes, commit, push, merge or deployment occurred.

Reproduction harness: `scripts/verify-auth-email-workflows.mjs`; ignored machine-readable evidence: `output/playwright/auth-email-retest/results.json`. The harness waits for links obtained from actual delivered mail; it does not generate administrative confirmation/recovery links.

Both previously blocked authentication workflows are now verified. This focused retest does not establish overall production readiness or verify unrelated features.

## Earlier verification (historical findings)

Repository: Arbab-ofc/NullChannel-v2.0. Branch: `feat/nullchannel-v2`.

Executed Chromium against the local React frontend, Express/Socket.IO backend and existing hosted Supabase project. No external responses were mocked. A connected test mailbox was available. SMTP and DKIM settings were not changed.

| Workflow | Result | Actual evidence |
| --- | --- | --- |
| Signup → confirmation email → confirm → login | BLOCKED | Public signup failed. Direct Supabase signup returned HTTP 500, `Error sending confirmation email`. No confirmation link was received or redeemed. |
| Forgot password → recovery email → reset → new login | BLOCKED | Actual UI recovery request returned HTTP 503 after the backend fix. The underlying Supabase mail operation failed. Password reset and new-password login remain unverified. |
| Login → page refresh → session persists | PASS | Disposable admin-confirmed Auth fixture logged in through the UI. Full page reload restored the profile; `/api/account/me` returned 200. This does not verify email confirmation. |
| Logout → protected routes inaccessible | PASS | Dashboard redirected to login; the logged-out browser's `/api/account/me` returned 401. |
| Create account → correct persistent profile | PASS, limited | Real admin-created Auth account triggered the correct username profile and default privacy row. Public signup remains blocked. |
| Guest create → join → messages → destroy | PASS | Two independent contexts exchanged two messages via Socket.IO. Supabase held messages before destruction; afterward the room and messages were absent and room history returned 404. |
| Invalid credentials, duplicate signup, expired links, unauthorized access | PARTIAL | Wrong password returned 401. Duplicate signup returned neutral 201 and preserved exactly one original profile. Missing recovery tokens were rejected. Unauthorized account API returned 401. Actual expired/consumed delivered links were not tested. |

## Bugs fixed

- Forgot-password discarded `resetPasswordForEmail` errors and reported success during a provider outage. It now returns a safe 503 for provider failures and 429 for provider rate limits.
- Signup classified provider failures as ordinary 400 registration errors. The same helper now distinguishes temporary provider outages and rate limits without exposing raw SMTP details or tokens.

Changes: `server/src/routes/account.routes.ts`, `server/src/services/auth-email.service.ts`, `server/src/tests/auth-email.test.ts`, and focused browser harness `scripts/verify-auth-workflows.mjs`.

## Verification and cleanup

- Focused server tests: 26 passed across 3 files (`auth-email`, `account`, `registered-route-boundary`).
- Focused client tests: 8 passed across 3 files (`auth-ui`, `account-session-ui`, `account`).
- Server TypeScript check and ESLint on changed server files passed.
- Only disposable fixtures were deleted; Auth/profile cleanup was verified. Existing users and SMTP/DKIM configuration were preserved.
- Machine-readable browser evidence is in ignored `output/playwright/auth-verification/results.json`. Passwords and authentication tokens are not included in reports.

## Required external action

Open Supabase Dashboard → Logs → Auth and inspect failed confirmation/recovery sends around 2026-10-11 17:52–18:00 UTC. Correlate them with Brevo transactional email logs. Provide only the provider error code and message, omitting credentials, tokens and email links. A successful SMTP test does not establish that these actual Auth-template sends succeeded. No SMTP setting change can be prescribed accurately until the delivery failure is identified.

Once real sends succeed, rerun public signup/confirmation and recovery/reset using a disposable mailbox alias, then test expired or consumed email links. Do not substitute admin confirmation or generated administrative links for delivered-mail verification.

Registered authentication is not ready for release until confirmation and recovery workflows are verified. Login/session/logout and guest messaging/destruction passed. No commit, push, merge or deployment was performed.
