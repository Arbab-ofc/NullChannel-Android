# NullChannel feature verification — 2026-10-12

## SECTION A — Executive summary

Repository: https://github.com/Arbab-ofc/NullChannel-v2.0. Branch: `feat/nullchannel-v2`. Existing uncommitted work was preserved. The local React/Vite frontend and Express/Socket.IO backend used the existing hosted Supabase project and actual ImageKit integration. Email-authentication workflows were not repeated; admin-confirmed disposable users were used only to exercise registered features.

**Overall: READY WITH WARNINGS**, subject to the limits below; this is not a claim of complete E2E or WCAG coverage. One application history bug was reproduced on the hosted database, fixed and retested. No known unresolved application failure remains in the exercised workflows. No production schema/RLS/environment changes, SMTP/DKIM changes, commit, push, merge or deployment were performed.

Feature groups checked: **37**. **32 PASS**, **0 FAIL**, **1 BLOCKED**, **4 UNVERIFIED**. PASS includes the evidence layer stated for that row; isolated SQL or unit evidence is not presented as hosted/browser E2E.

### Source-derived feature inventory

The source inspection covered workspace scripts, React routes/pages/hooks, Express route mounting, registered/guest middleware, socket handlers, ImageKit services, cleanup scheduling, schema/migrations and existing test harnesses. Public application branding remains NullChannel.

| Domain | Frontend / backend | Database / RPC | API / realtime | Tests / expected behavior |
| --- | --- | --- | --- | --- |
| Profile/avatar/privacy | AccountPages, useAccount / account.routes, avatar.service | profiles, privacy_settings, profile_avatar_intents; commit_profile_avatar | `/account/me`, `/account/profile`, `/account/avatar`, `/account/avatars/:username`, `/account/privacy`; presence updates | account, avatar, social SQL, hosted boundary harness; persistent owner-controlled profile, private provider avatar |
| Friends/blocks | FriendsPage / social.routes, social.service | friendships, friend_requests, user_blocks; social_action | `/social/search`, `/social/friends`, `/social/requests`, `/social/blocks`; `friend:request`, `friend:accepted`, `friend:updated` | social SQL race tests, browser and hosted fixtures; relationships persist without message history |
| Presence | Dashboard/account-socket / presence.service | nc_presence is an ephemeral eligibility lease | `presence:set`, `presence:heartbeat`, privacy-filtered `presence:update` | presence unit tests plus hosted multi-tab/Invisible/Away/disconnect |
| Direct rooms/invitations | InvitationsPage, ChatPage / registered-room.routes | rooms, room_members, nc_invitations, nc_room_identities; nc_invitation_create/respond | `/registered/invitations`, `/rooms/:code`, `/registered/rooms`; `invitation:received`, `room-joined` | hosted temporary direct fixture; new room only after acceptance |
| Messages | ChatPage/useSocket / room.controller, message.service, room.socket | messages, message_reactions; guarded writes, mark_message_seen | `/rooms/:code/messages`, edit/delete/reactions/Burn; `send-message`, `receive-message`, message lifecycle events | real group/direct sockets; history-pagination regression; SQL lifecycle |
| Groups/moderation/polls | CreateRoomPage, GroupTools / group-tools.routes | nc_room_moderation, nc_polls/votes, nc_room_invite_tokens; nc_moderate, nc_poll_action, nc_token_* | registered room/poll/moderation/invite APIs; `poll:update`, `moderation:update` | real UI forms and SQL permissions; temporary role/member/poll state |
| Public discovery | ExplorePage / registered-room.routes | rooms plus active room_members; nc_join_registered | `/registered/explore`, room create/join; `directory:updated` | UI discovery and concurrent hosted capacity; finite active-only rooms |
| Matching/Ghost/reveal | MatchPage, ChatPage / match.routes, registered-realtime | nc_match_queue/proposals/reservations, nc_room_identities/consents; nc_match_* and nc_room_consent | `/match/start`, status/cancel/proposal/consent; `match:status`, `identity:consent` | actual hosted/browser timeout, atomic local SQL, live matched chat/reveal; session-only anonymity |
| Media | ChatPage/ViewOnceMedia / media.controller, media.service | media_uploads/intents/cleanup; authorize/consume_media_delivery | `/media/upload`, `/media/files/:fileId`; message media events | actual ImageKit/browser flow, media SQL, worker retry; immediate authorization revocation and eventual provider deletion |
| Lifecycle/privacy | PrivacyPage / cleanup.service, privacy.routes, server scheduler | cascading room FKs and nc_room_cleanup | `/registered/privacy`, `/registered/sessions/end`, terminate; `room-expired`, membership revocation | scoped hosted cascades and isolated lifecycle SQL; no restoration of destroyed chats |
| Notifications | NotificationBell, NotificationsPage / notification.routes | account_notifications, preference/expiry triggers | `/notifications`, `/notifications/unread`; `notifications:update` | real ownership/read/dismiss plus SQL opt-out; no message-body notifications |
| Calls | Existing voice hooks / call.socket | current call state in single-process memory | authenticated `call:*` signaling | native Chromium peer/RTP plus signaling tests; private-room audio, no group audio implementation |
| Navigation/docs/theme | App/AccountLayout/DocsPage/globals.css | no new database domain | 73 HTTP operations; documented socket contracts | route/theme sweep, client tests, docs check; preserve branding and both themes |

## SECTION B — Feature verification matrix

Evidence artifacts below are under ignored `output/`; code references resolve under `server/src`, `client/src`, `docs` or `scripts` as named. The table reports specific behavior, not every possible scenario in a domain.

| Feature | Expected behavior | Status | Actual behavior/evidence | Related code/evidence |
| --- | --- | --- | --- | --- |
| Profiles and concurrent updates | Own profile survives updates; peers cannot edit it | **PASS** | Hosted concurrent display-name/bio edits persisted; target-ID injection denied. Missing profile denied account APIs. | `account.routes.ts; account.service.ts; feature-boundaries.log` |
| Username constraints | Case-insensitive uniqueness, reserved names and cooldown | **PASS** | Hosted duplicate username denied and second change denied; local SQL concurrent rename test passed. | `account.routes.ts; v13; social.database.integration.test.ts` |
| Avatars | Private ImageKit avatar upload, retrieval and removal | **PASS** | Real upload and delivery 200; bad PNG signature 400; private peer retrieval denied; removal persisted. Provider fixture deleted. | `avatar.service.ts; account.routes.ts; feature-boundaries.log` |
| Privacy settings | Persist and enforce discoverability, presence and Ghost preferences | **PASS** | Hosted privacy updates persisted; blocking restricted search; isolated v22 SQL verified per-room anonymous/name defaults. | `social.service.ts; presence.service.ts; v22` |
| Friendship lifecycle | Search/request/accept/reject/cancel/remove persist correctly | **PASS** | Real browser search/accept and hosted reject/cancel; normalized friendship survived room destruction. | `social.routes.ts; social_action; browser-feature-verification.log` |
| Friendship concurrency/ownership | Prevent duplicate, self, crossed and unauthorized requests | **PASS** | Hosted crossed requests admitted one; concurrent acceptance succeeded once; outsider/self actions denied. | `social.routes.ts; feature-boundaries.log` |
| Blocking and expired requests | Blocked/expired relationships cannot communicate through social actions | **PASS** | Hosted blocked search/request denied; friendship removed; fixture-expired request could not be accepted. | `social.service.ts; feature-boundaries.log` |
| Presence | Multiple connections, Invisible, Away and Offline obey visibility | **PASS** | Hosted multiple-tab lease, Invisible filtering, Away and disconnect checks passed; unit tests cover privacy filtering. | `presence.service.ts; hosted-feature-retest.log` |
| Temporary direct chat | Friend invitation creates a new temporary room after acceptance | **PASS** | Hosted invitation/acceptance, authorized socket delivery, history and cascade cleanup passed; friendship remained. | `registered-room.routes.ts; nc_invitation_respond; hosted-feature-retest.log` |
| History completeness/ordering | All active messages available after reconnect, ordered deterministically | **PASS** | Original 1001-message fixture returned 500; after batching fix all 1001 returned. Group socket reconnect recovered history. | `message.service.ts; history-pagination.test.ts; feature-history-fixed.log` |
| Message validation and ownership | Reject oversized messages and cross-user edits; attribute authenticated sender | **PASS** | Real group sender spoof was replaced with the actor’s room identity; 12001-character payload and peer edit denied; own edit/delete passed. | `room.socket.ts; room.controller.ts; feature-boundaries-retest.log` |
| Group creation/membership | Finite private group with invitation-based access and unique memberships | **PASS** | Hosted three-member group and UI invite-link flow passed; one-use token reuse denied; outsiders denied. | `nc_create_registered; nc_token_consume; feature-ui.log` |
| Group moderation | Server roles control muting, removal and destruction | **PASS** | Hosted owner mute/unmute and kick; ordinary member termination denied; kicked member lost history access. | `group-tools.routes.ts; nc_moderate; feature-boundaries-retest.log` |
| Temporary polls | Create, vote, close and cascade temporary ballots | **PASS** | Actual UI create/vote updated peer UI and SQL ballot; hosted duplicate ballot prevention and local close/expiry permissions passed. | `GroupTools.tsx; nc_poll_action; feature-ui.log` |
| Public rooms/discovery | Eligible users discover and join finite public rooms | **PASS** | Actual creation/search/join forms passed; hosted directory filtered by room name and termination removed room. | `TemporaryPages.tsx; registered-room.routes.ts; feature-ui.log` |
| Capacity and expiry access | Concurrent joins respect capacity; expired rooms vanish and deny access | **PASS** | Hosted two competing joins for one slot admitted one; repeated join did not duplicate membership; fixture expiry removed discovery and denied history. | `nc_join_registered; feature-boundaries.log` |
| Invitation security | Unpredictable hashed tokens; atomic capacity, use and expiry checks | **PASS** | Hosted one-use link reuse denied; isolated SQL verifies concurrent consumption, revocation and expiry. No invite secrets exposed in reports. | `group-tools.routes.ts; v16; registered-rooms.sql` |
| Matchmaking mutual acceptance | Eligible registered users reserve atomically and mutually accept | **PASS** | Hosted pair produced proposal, two acceptances and one anonymous room. Local real SQL concurrency verifies four-user reservations and duplicate acceptance. | `match.routes.ts; nc_match_start/nc_match_respond; registered-database.integration.test.ts` |
| Matching cancellation/disconnect/expiry | Release queue/proposal state and reject late actions | **PASS** | Local real PostgreSQL cancellation/deadline cases passed; hosted Away/disconnect revoked eligibility. Full cross-device browser cancellation matrix was not exercised. | `nc_match_cancel; presence.service.ts; registered-match.sql` |
| Exact matchmaking timeout | Server deadline is 60 seconds; no room/reservation after timeout | **PASS** | Actual browser showed “Nobody is available right now.” with no queue/reservation/room mapping. Separate hosted run waited for server deadline and verified removal. | `MatchPage; browser-feature-verification.log; hosted-feature-retest.log` |
| Ghost identity exposure | Room metadata/participants/history/messages hide persistent identity | **PASS** | Hosted matched room returned rotating sender UUIDs and Ghost aliases; scanned metadata/participants/history for all fixture UUIDs, emails and usernames. This is scoped evidence, not a universal anonymity guarantee. | `room.socket.ts; nc_room_identities; hosted-feature-retest.log` |
| Mutual reveal and Ghost-to-Friend | No unilateral reveal; friendship independent of expired session | **PASS** | Hosted rejected reveal returned no profile; mutual reveal returned consenting profile; mutual connect created friendship surviving room/message/consent deletion. | `nc_room_consent; match.routes.ts; hosted-feature-retest.log` |
| Private temporary media | Authorized delivery succeeds; outsiders and destroyed rooms denied | **PASS** | Real browser upload 200, provider-backed delivery 200, outsider 401, post-destruction 404; metadata and provider deletion confirmed. | `media.controller.ts; verify-browser-media.ts; media-feature-verification.log` |
| Timed/Burn/view-once database policies | Revoke access at deadline; consume view-once atomically | **PASS** | Real isolated PostgreSQL expiry/reaction/reply/view-consumption tests passed. Hosted Burn read receipt was accepted; full real-provider view-once browser flow was not run. | `v20; ephemeral-message.database.integration.test.ts; media-access.database.integration.test.ts` |
| Durable media cleanup | Failed provider deletion retries after restart; absent objects succeed idempotently | **PASS** | Real ImageKit fixture, invalid-key worker failure, persisted backoff, valid-key new process recovery, confirmed provider absence and repeated absent-object cleanup all passed. | `cleanup.service.ts; media-cleanup-feature-verification.log` |
| Room destruction | Revoke access and cascade messages/memberships/aliases/polls/invitations | **PASS** | Hosted direct/group/match and browser guest destruction checks verified scoped database cascades; provider-backed media cleanup verified separately. | `cleanupRoomsByIds; v15/v16; hosted-feature-retest.log` |
| Notifications | Account ownership, offline delivery, unread/read/dismiss and privacy | **PASS** | Hosted notification existed without account UUID/email; peer mark-read had no effect; own read/dismiss persisted. Friend-request UI received through actual application logic. | `notification.routes.ts; account_notifications; feature-boundaries.log` |
| Privacy dashboard/end sessions | Truthful cleanup status; leave shared rooms, destroy owned rooms | **PASS** | Live privacy API returned active-call/cleanup fields; member End All revoked access and retained owner room; owner End All removed room. Dashboard rendered in browser. | `privacy.routes.ts; PrivacyPage; feature-privacy.log` |
| Account deletion | Reauthenticate and remove only account-owned persistent relationships | **PASS** | Browser Settings deleted disposable C; Auth/profile/friendship gone while A–B friendship survived. Isolated SQL verifies deletion races. | `account.routes.ts; v21; browser-feature-verification.log` |
| Routes and API documentation | Implemented routes render; documentation reflects actual route inventory | **PASS** | Real navigation and documentation UI loaded; docs consistency check verified 73 actual HTTP operations. This is not proof of every OpenAPI response schema. | `App.tsx; DocsPage.tsx; generate-api-docs.mjs` |
| Responsive layout and composer | No horizontal overflow; composer fits supported widths/themes | **PASS** | Browser width/theme route sweep plus 22 active-chat viewport checks and 390×430 reduced-height case; representative screenshots inspected. See exact sweep totals below. | `audit-responsive.mjs; audit-chat-responsive.mjs` |
| Network error/recovery | Report real network failure and recover after reconnect | **PASS** | Chromium offline search showed the real connection error; after reconnect the real username search returned the profile. | `FriendsPage; accountError; feature-network-retest.log` |
| Message resend idempotency | Prevent duplicate delivery on an application-level retry | **UNVERIFIED** | Protocol has no client message idempotency key; identical repeated text may legitimately create distinct messages. No exactly-once guarantee or replay prevention is claimed. | `socketMessageSchema; useSocket.ts` |
| Physical devices/NAT/native keyboard | Actual microphones and mobile operating-system keyboard remain usable | **UNVERIFIED** | Chromium real peer/RTP and synthetic microphone passed; hardware devices, external NAT traversal and native mobile keyboards were not tested. | `call.socket.ts; voice hooks` |
| Complete WCAG 2.2 AA | All contrast, screen reader and keyboard flows satisfy AA | **UNVERIFIED** | Labels and focus/navigation mechanisms inspected; representative layouts tested. No comprehensive accessibility audit was executed. | `Modal.tsx; AccountLayout.tsx; globals.css` |
| Global hosted cleanup sweep | Scheduled worker deletes expired hosted records safely | **BLOCKED** | Global background cleanup intentionally disabled to preserve unrelated records. Real isolated SQL lifecycle tests and fixture-scoped cascades/provider worker checks passed; shared-room global sweeps were not run. | `server.ts; cleanup.service.ts` |
| Orphan-upload recovery and broken-image fallback | Recover interrupted provider writes and show an appropriate broken-image state | **UNVERIFIED** | Upload-recovery test doubles and SQL leases passed; an interrupted real provider upload and deliberate broken-image UI workflow were not executed. Normal upload/deletion and durable deletion retry were verified separately. | `media.service.ts; avatar.service.ts; upload-recovery.test.ts` |

Ghost Mode is session-specific. Independent account discoverability remains controlled by profile privacy settings; being anonymous inside a room does not globally remove an otherwise discoverable registered profile from username search. Group voice is intentionally unsupported and was not represented as a shipped feature. Persistent DM threads, group templates and chat restoration are absent by design.

## SECTION C — Bugs and fixes

### Medium — large temporary histories fail and truncate

A fixture with 1,001 messages reproduced HTTP 500 from the actual history endpoint. Direct diagnostics showed the provider returned only 1,000 message rows and the single reaction query over those IDs failed. Smaller bounded reaction queries succeeded. This establishes both the provider row cap and failure of oversized hydration queries; a specific provider HTTP error code was not captured.

`server/src/services/message.service.ts` now pages internal reads in batches of 100, applies deterministic `(created_at, id)` ordering, and hydrates reactions/replies within those bounded batches. All legacy-column fallback reads also page. The external array response and temporary-history rules are preserved. The exact hosted 1,001-row reproduction returned all 1,001 messages after the fix. Two new `history-pagination.test.ts` cases verify provider-boundary completeness and that a full page of expired messages does not hide later live messages.

Remaining risk: the API still returns a complete array rather than a client-visible cursor; very large active histories consume memory and additional requests. Multi-page offset reads are not a transactional snapshot during concurrent deletion. This does not create permanent history, but warrants future performance/concurrency work.

### Test infrastructure corrections

- The new boundary harness initially treated HTTP 410 as an accepted unauthorized action; 410 is an access denial. Corrected the harness and reran the full affected group/socket workflow successfully.
- The UI offline-recovery harness used incorrect text selectors. Corrected them to actual product error/profile markup; the original offline/online interaction passed.
- The existing responsive harness left its guest room behind. It now deletes only its recorded fixture room in `finally`.
- Pagination required the isolated manual voice database adapter to support ranges and multiple ordering fields. Updated only the test-only adapter. It remains outside the production build and is not used for hosted feature evidence.

No tests were removed or disabled to obtain passing results. New harnesses: `scripts/verify-feature-boundaries.mjs`, `scripts/verify-feature-ui.mjs`, `scripts/verify-feature-browser.mjs`.

## SECTION D — Security findings

- **Critical:** none found in exercised boundaries; this is not a guarantee of absence.
- **High:** no persistent account identity leakage found in the tested anonymous room metadata, participants/history and message attribution. Room-member, file and relationship ownership denials passed.
- **Medium:** high-volume history failure fixed. Remaining large-history memory/snapshot risks are recorded above. Native device/NAT and complete accessibility assurance remain unverified.
- **Low:** message protocol has no application idempotency key; exactly-once delivery must not be promised. Avatar broken-image fallback was inspected but not tested against a deliberately failed provider response. Rate-limit contracts passed unit/socket tests; a dedicated live abuse-load test was not performed.

Registered identity comes from validated Supabase cookies, never a submitted account UUID. Socket packets revalidate credentials and replace sender identity/name with server-derived room identity. Mutating APIs require matching Origin; file access uses server authorization and short provider signatures. Operational reports contain no credentials, tokens or real-user message bodies. No broad exploit or destructive scan was run.

## SECTION E — Database findings

Read-only hosted catalog inspection found **30 application tables, all with RLS enabled**. None granted direct SELECT or write access to `anon`/`authenticated`. Checked sensitive room/social/media RPCs were not executable by these roles. The server service role is the authorization boundary; RLS alone does not validate server business rules.

`npm run db:inspect` verified the recorded checksums for **v13–v22**, with no pending migrations or modified migration history. No hosted migration was applied. The catalog, policy names and checked function grants/configuration are saved in `output/feature-remote-catalog.json`.

Hosted fixture evidence includes normalized friendship races, unique membership/capacity, role access, scoped expiration denial, temporary identity/consent/poll/invitation cascades and provider cleanup jobs. Independent real PostgreSQL tests use isolated local `nullchannel_test_*` databases; these are test fixtures, not a second application backend. Migration tests load SQL only into their isolated local database. Existing hosted application data was not reset or truncated.

Global cleanup was disabled in the local server using a process-only override. The actual provider worker retry harness refuses to start unless the shared cleanup queue is empty and operates with an explicitly created provider fixture. Shared-table global expiration sweeps were not invoked. A read-only post-run check of newly created audit-account naming patterns found only the then-active responsive account; all completed fixture harness accounts were absent. The responsive sweep removes its recorded guest room and account on completion; a final read-only remainder check found zero matching recent audit profiles and zero matching audit room names.

## SECTION F — Test results

- Final server suite: **217 passed, 0 failed, 0 skipped**, 29 files. Includes isolated real PostgreSQL concurrency/migration/lifecycle tests and both opt-in native Chromium voice tests. Unit/network test doubles remain confined to automated test harnesses.
- Client suite: **84 passed, 0 failed, 0 skipped**, 22 files (unit/UI tests with test-only mocks).
- Focused history/Burn/TTL regression run: **14 passed**, including two new pagination tests. These overlap the final suite and are not added to its total.
- Root TypeScript checks (server, client, manual), root ESLint, server production build, frontend production build and route-documentation consistency all passed.
- Documentation consistency: **73 actual HTTP operations**. This checks route coverage; it does not validate every declared response against live data.
- Real hosted/browser results: profile/avatar, social races/ownership, temporary direct/group/public/match rooms, consent, notifications, privacy session termination, native peer/RTP, account deletion and actual media delivery/cleanup passed as individually described above.
- Original responsive sweep: **395 completed checks**, **87 screenshots**, and one dark-320px chat navigation timeout. No overflow or other route/page-error failures were reported. The exact dark-320px width/theme rerun passed all **18 routes**, with **4 screenshots** and no failures; the independent active-chat sweep already passed all **22 width/theme checks** plus the reduced-height case (**23 screenshots**). The initial failure is retained rather than hidden.
- Representative images actually inspected: dark 320px dashboard and retested name-entry chat, dark 1920px homepage, light 768px dashboard, light 1920px documentation, active light 320px chat and 390×430 reduced-height chat. Generic guest restoration screenshots can show the name-entry dialog; the separate active-chat sweep verifies the actual composer. No claim is made of inspecting all screenshot pixels or real mobile keyboard behavior.

Relevant commands were executed from their actual workspace. For hosted TypeScript harnesses the working directory is `server`, so its existing `.env` is loaded. This avoids the invalid-environment error produced by an initial root-directory invocation; no credentials were changed.

Commands:

```sh
npm run db:inspect
npm run typecheck
npm run lint
npm run build
npm run docs:check
npm run test --workspace client
# Server suite: isolated local TEST_DATABASE_URL, TEST_MIGRATION_DATABASE_URL,
# REGISTERED_TEST_DATABASE_URL, SOCIAL_TEST_DATABASE_URL, MEDIA_TEST_DATABASE_URL;
# RUN_WEBRTC_BROWSER=1
npm run test --workspace server
# In server/:
RUN_HOSTED_UPGRADE_FIXTURES=true npx tsx src/scripts/verify-registered-upgrade.ts
npx tsx src/scripts/verify-browser-media.ts
npx tsx src/scripts/verify-media-cleanup.ts
# At repository root:
node scripts/verify-feature-browser.mjs
node scripts/verify-feature-boundaries.mjs
node scripts/verify-feature-ui.mjs
node scripts/audit-responsive.mjs
node scripts/audit-chat-responsive.mjs
```

The first hosted run safely skipped its timeout when another audit browser had a queue entry. The sequential hosted rerun completed the real deadline wait. Earlier failed artifacts are retained for traceability; use the final/retest files for final outcomes. Full browser email authentication was not rerun.

## SECTION G — Production readiness

**READY WITH WARNINGS** for the exercised single-backend architecture after the history fix. Production deployment itself is unverified and unauthorized. Physical microphone/NAT/mobile keyboard testing, a complete accessibility review, history-scale/cursor design and controlled production-worker observation remain advisable. Presence/calls use process-local coordination: do not claim verified multi-node support. Group audio is unsupported.

## SECTION H — Deployment blockers

No unresolved verified application defect remains in the exercised workflows. The deliberately unexecuted shared global sweep is a verification boundary, not evidence of a broken worker. No new authentication, SMTP, ImageKit delivery or migration blocker was observed. Deployment, push and merge remain unauthorized.

## SECTION I — Recommended next actions

1. Review the history fix and this report before any authorized deployment.
2. Observe the normal cleanup worker in a controlled environment with isolated records, rather than sweeping unknown hosted data during an audit.
3. Test physical mobile keyboards and real microphones across expected networks; configure/verify TURN if the deployment requires reliable NAT traversal.
4. Complete WCAG/keyboard/screen-reader review and provider-failure avatar fallback verification.
5. Plan cursor-based frontend history loading and explicit resend idempotency if those become supported product guarantees; any schema change requires a separately reviewed migration.

No commit, push, merge or deployment was performed.
