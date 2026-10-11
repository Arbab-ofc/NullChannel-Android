# NullChannel testing and evidence

Audit run: 2026-10-11, branch `feat/nullchannel-v2`. Test fixtures were disposable and scoped to their own Auth IDs, rooms, and provider file IDs. No push, merge, or deployment was performed.

## Latest automated checks

- Server: **211 passed, 0 skipped** across 26 test files. Of the original 57 skips, 55 SQL integration cases ran against fresh isolated local PostgreSQL fixtures and two opt-in Chromium/WebRTC cases ran with `RUN_WEBRTC_BROWSER=1`.
- Client: **84 passed, 0 skipped** across 22 test files.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run docs:check` passed. A final responsive navigation CSS adjustment was also built and checked at all 11 widths in both themes.
- `npm run docs:check`: 73 actual HTTP operations documented and consistent.
- Presence focused unit suite: **8 passed**.
- OpenAPI 3.1 was validated during implementation; the current docs consistency check also passed.

## Reproducible commands

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm run docs:check
RUN_HOSTED_UPGRADE_FIXTURES=true npx tsx server/src/scripts/verify-registered-upgrade.ts
node scripts/verify-browser-workflows.mjs
npx tsx server/src/scripts/verify-private-media.ts
npx tsx server/src/scripts/verify-browser-media.ts
```

The hosted scripts require the existing local `server/.env` configuration and use the existing Supabase project. They create identifiable disposable records and delete only their own fixtures. Do not run unrelated destructive fixture suites against a production/project DSN. Local SQL integration suites use separate `TEST_DATABASE_URL` and `REGISTERED_TEST_DATABASE_URL` databases; they must not share a database because legacy guest setup can overwrite later authorization functions.

## Real browser and hosted workflow evidence

`scripts/verify-browser-workflows.mjs` launched Chromium against the actual Vite frontend and Express/Socket.IO backend, with hosted Supabase Auth and DB. Separate contexts were used for three admin-created, confirmed test accounts and a guest. It verified route protection, real UI login, profile update persistence, friend search/request/accept across browsers, account deletion after password reauthentication (including Auth/profile/friend cleanup and preservation of A–B), invalid credentials, guest room creation/join/message, WebRTC peer establishment and nonzero outbound RTP from a fake microphone, Burn Mode activation, destruction and no remaining room access, and logout. This is browser evidence for those exact flows only. Admin-created confirmed users do not verify signup confirmation email.

`server/src/scripts/verify-hosted-social.ts` previously passed real hosted profile/privacy persistence, friendship request and acceptance, offline direct invitation, temporary room creation, group invitations and poll voting, public discovery/join, group/public destruction, and ending active sessions. Each run cleaned only its own fixtures.

`server/src/scripts/verify-registered-upgrade.ts` exercises hosted registered auth, friend state, multiple-tab presence, direct chat, public rooms, groups, matchmaking, reveal, and the server-enforced 60-second timeout. The complete hosted run passed confirmed login/profile, friendship, multi-tab presence and Invisible filtering, registered direct socket messaging/Burn receipt/destruction with friendship survival, public discovery/join/destruction, private group invite/polls/moderation/destruction, two-user match proposal/rejection/connection, anonymous matched-room messaging, rejected and mutual reveal, Ghost-to-Friend, room destruction and friendship survival, plus an actual server-deadline wait with queue cleanup. Three disposable Auth fixtures were removed. The harness also checks Away and Offline visibility and sends regular server heartbeats so the test itself does not accidentally let presence expire.

The actual ImageKit probe uploaded a valid 1×1 PNG, confirmed provider metadata and private/published state, then tried the upload URL, path-signed URL, source-signed URL, no-expiry signed URL, and provider-returned URL. Each delivery returned **404**. `server/src/scripts/verify-browser-media.ts` exercised real guest UI upload (200), private metadata persistence, unauthorized delivery (401), authorized delivery failure, room destruction, post-destruction access denial (404), and durable cleanup queue creation. It deleted its provider file and confirmed provider lookup returned 404 before removing only its own cleanup and metadata rows. The provider delivery configuration and automated worker retry against this external failure remain unresolved.

## Isolated PostgreSQL integration tests

Registered database integration evidence from the isolated SQL fixture suite covers the server-recorded 60-second deadline and queue cleanup; mutual proposal acceptance before room creation; concurrent reservation and acceptance; block filtering and transient identities; rejected and mutual reveal; ephemeral identity/membership cascade with friendship survival; public capacity and private membership authorization; single-use invitation consumption; poll voting/closing permissions; Burn receipt timing; and moderation cascade. These rollback/scoped local SQL tests exercise database functions, not a hosted two-browser matchmaking session.

## Limits of this audit

Responsive route checks ran for every requested width and theme, with representative screenshots inspected. They verify layout overflow and route availability, not every visual or WCAG criterion. Password reset and signup confirmation require actual deliverable email access and were not completed. Voice was verified with Chromium’s synthetic microphone, not physical devices or Internet NAT traversal. The hosted 60-second backend timeout and real browser timeout message passed; hosted matchmaking proposal/reveal/connection passed, with a repeat adding matched-room socket messaging and mutual reveal. The authoritative, per-workflow record is [NULLCHANNEL_WORKFLOW_AUDIT.md](NULLCHANNEL_WORKFLOW_AUDIT.md).

## Follow-up verification — 2026-10-11

The earlier skip count is superseded by a full run with isolated local PostgreSQL fixtures and opt-in real-browser coverage:

- Server: **211 passed, 0 skipped** across 26 files. This includes all 55 SQL tests that previously skipped and both real-browser tests enabled with `RUN_WEBRTC_BROWSER=1`.
- Client: **84 passed, 0 skipped** across 22 files.
- Focused media delivery regression: **5 passed** after adding provider status/diagnostic logging.
- The final suite ran against five fresh local `nullchannel_test_audit_*` databases, including an empty rerun migration database; the three feature-schema databases were loaded with the versioned schema chain through v22. The hosted Supabase database was not used as a destructive test fixture.
- The responsive sweep covers 18 routes at 11 required widths in both themes: **396 route/viewport checks**, no horizontal overflow or navigation failures, and **88 screenshots**. Representative mobile, tablet, and desktop images were inspected. The chat-specific sweep adds 22 width/theme captures plus one 390×430 short-height keyboard scenario.
- Screenshot inspection exposed wrapped desktop navigation labels; the homepage header was widened and its desktop items kept on one line. A follow-up homepage sweep passed **22 checks** (11 widths × 2 themes), and the updated desktop/mobile screenshots were inspected.
- The ImageKit cleanup retry harness used an isolated uploaded provider object and disposable queue rows. A deliberately invalid provider credential made the first separate worker process receive an authorization failure; the job persisted with backoff. A second process restarted with the valid key, deleted the object, confirmed provider absence, and removed the queue record. A second queued deletion for the already-absent object was also treated as success and removed, verifying idempotency. This does not verify successful ImageKit delivery.
- Supabase Auth configuration was queried using the existing project: signup and email auth are enabled, while `mailer_autoconfirm=false`. Confirmation and recovery mail delivery remain externally blocked.
- ImageKit upload, metadata, deletion and cleanup are verified. Delivery remains blocked: every provider delivery URL returned 404 with `ik-error: ENOENT - Resource not found at any upstream origin`.
- Supabase Auth public settings confirm email signup is enabled and confirmation is required. Actual confirmation and recovery email delivery remain unverified because no Management API access, SMTP settings, or test mailbox were available.

Screenshots and machine-readable viewport results are under `output/playwright/nullchannel-responsive/`. The exact current findings and external actions are recorded in [NULLCHANNEL_WORKFLOW_AUDIT.md](NULLCHANNEL_WORKFLOW_AUDIT.md).

To reproduce the formerly skipped SQL suites, provide separate local loopback DSNs for `TEST_DATABASE_URL`, `TEST_MIGRATION_DATABASE_URL`, `REGISTERED_TEST_DATABASE_URL`, `SOCIAL_TEST_DATABASE_URL`, and `MEDIA_TEST_DATABASE_URL`. Each must name a disposable database with a path beginning `/nullchannel_test`; never point these variables at the hosted Supabase database.

## Focused authentication verification — 2026-10-11

Actual local-browser checks against hosted Supabase passed login, page-refresh restoration, logout protection, triggered profile/default creation, and guest room creation/join/messaging/destruction. The account fixture was admin-confirmed; public signup confirmation was not verified. Wrong passwords, duplicate-account safety, unauthorized APIs and missing reset tokens passed; real expired email links remain unverified.

The connected test mailbox was available, superseding the earlier mailbox limitation. Actual Supabase confirmation sending returned HTTP 500 (`Error sending confirmation email`), and recovery sending failed. Fixed the backend's discarded recovery errors and misleading signup error classification; provider outages now return safe 503 responses and rate limits return 429. The real recovery UI request returned 503 after the fix. SMTP/DKIM were unchanged.

Focused checks: 26 server tests and 8 client tests passed, server TypeScript passed, and changed-file server ESLint passed. Disposable Auth/profile and room/message cleanup was verified. See [NULLCHANNEL_AUTH_VERIFICATION.md](NULLCHANNEL_AUTH_VERIFICATION.md) for per-workflow results and the exact provider-log action needed before mail-dependent verification can resume.

## Implementation-aware feature verification — 2026-10-12

The final server suite passed **217 tests in 29 files, zero failures/skips** with opt-in Chromium voice tests and isolated local PostgreSQL DSNs. Client tests passed **84 in 22 files, zero failures/skips**. Root typecheck, lint, both builds and the 73-operation documentation consistency check passed.

New live fixtures reproduced an HTTP 500 for 1,001-message history: the provider row cap and oversized reaction hydration were handled incorrectly. Internal history reads/hydration now use batches of 100 and deterministic ordering. The exact hosted reproduction returned all 1,001 messages after the fix; two new regression cases passed. The test-only manual database adapter gained ranges/multiple ordering to preserve native voice regression coverage.

Hosted/browser coverage newly verified avatars through ImageKit, social crossed-request/acceptance races, ownership/block/expiry denials, group socket reconnection/edit/delete/kick, public capacity races, notification read/dismiss isolation, privacy End All role behavior, group/poll/public UI forms and offline-search recovery. Real temporary ImageKit delivery was 200, unauthorized 401, post-destruction 404, with provider deletion confirmed. Real cleanup failure/restart/idempotency also passed.

The responsive sweep completed 395 route checks with one initial dark-320px chat timeout; its focused rerun passed all 18 routes. The separate active-chat sweep passed all 22 width/theme checks plus a reduced-height viewport. Representative screenshots were inspected. Global hosted background cleanup was disabled to protect unrelated data; scoped fixtures and isolated SQL verified lifecycle behavior instead. A final read-only check found no matching recent audit profiles or room names remaining.

See [NULLCHANNEL_V2_FEATURE_VERIFICATION.md](NULLCHANNEL_V2_FEATURE_VERIFICATION.md) for the inventory, evidence layers, initial failures/retests, security findings, known coverage limits and readiness assessment. Authentication email workflows were not repeated. No production migration, commit, push, merge or deployment occurred.
