# NullChannel session, temporary-room and call stability fixes

12 October 2026. Repository: Arbab-ofc/NullChannel-v2.0. Base: production release `5677adb`. Branch: `fix/nullchannel-session-room-call-stability`.

The checkout was clean at the start. All changes are local and uncommitted. No hosted database, real user account, SMTP, ImageKit, VPS, production environment or service was modified. No deployment, merge or push occurred.

## Root causes and fixes

| Report | Source evidence | Fix and verification |
| --- | --- | --- |
| Brand appears to log out | Shared headers linked to public `/`; the chat sidebar and footer also used full-page anchor navigation. AccountProvider is above the keyed route boundary, so it was not being remounted by ordinary route changes. | Authenticated brand links use `/dashboard`, guests use `/`, and internal brand/footer navigation uses React Router. Regression clicks the brand ten times and selects OLED without logout, session refresh or socket teardown. A public landing page alone was not proof of logout; no production incident logs were inspected. |
| Unexpected logout | AccountProvider caught all profile errors by setting profile null. The account interceptor dispatched expiration for any refresh failure. Backend refresh cleared cookies for any Supabase error; getUser treated provider failures as invalid credentials. | Only confirmed invalid-session responses clear account state/cookies. Provider/network/rate-limit/authorization failures retain previously validated state and return a retryable error; initial validation failure shows Retry instead of a premature protected-route login redirect. Backend outage returns sanitized503. Single-flight refresh, browser Web Locks and in-process token-rotation coalescing prevent overlapping refresh races. Logout is never replayed; it shares the browser refresh lock when available and otherwise waits for local in-flight rotation, preventing a late refresh from replacing cleared cookies. Storage errors do not undo server logout. Tests cover401,403,429,500,502,503, cross-tab logout, stale restoration and unrelated storage events. |
| Guest connection interrupted by account initialization | Account-expired clearing disconnected the room socket even when no registered profile had ever been validated. | Initial guest account failure no longer disconnects an unrelated guest transport. Confirmed registered-session end and explicit Logout still tear down private state. The real local guest browser entry/voice workflow passed without API interception. |
| Repeated/reversed direct invitations | v16 create RPC inserted arbitrary direct invites. Respond deleted the invitation after acceptance or rejection; no pair guard, active room link or durable rejection deadline existed. | Additive v23 guards unordered pairs using transaction advisory locks and a primary-keyed pair row. Pending invites, active direct rooms and15-minute server deadlines block both directions. Existing privacy/friend/block/group validation is reused inside private base functions. Real PostgreSQL tests prove concurrency and transition behavior. |
| Accepted rooms disappear from ordinary account navigation | Existing `/registered/rooms` reads identities/memberships correctly, but dashboard had no temporary-room section. Generic lists missed reconnect, acceptance and room updates; accept route emitted no account room update. | Temporary Rooms on Dashboard/Friends uses the existing server list, deduplicates codes, reopens `/chat/:code` and hides expired entries. Server accept/decline emits `rooms:updated` to both participants; termination emits updates to affected accounts. Reconnect/directory updates reconcile lists. An event during an in-flight request invalidates its stale response and schedules one follow-up fetch; a regression prevents terminated rooms from being restored by that response. No new thread or lifetime reset is introduced. Room type is added to existing metadata responses. SQL proves two identities, active message persistence and cascade removal on destruction. |
| Menu covers selected message/clips | ResponsiveActions rendered desktop menus inline inside message/overflow containers with relative positioning. | Portal with measured above/below/side placement, viewport/composer bounds, scroll/resize/ResizeObserver updates and a sheet fallback when no placement fits. Mobile retains an action sheet, now with its own opaque theme surface, spacing and explicit close button. Focus happens after geometry is committed; Escape, outside dismissal, arrow navigation and focus restoration work. Existing Reply/React/Pin/Edit/Delete handlers and authorization remain unchanged. |
| Calls disconnect on brief signaling loss | Client `disconnect` immediately closed AudioPeer; server `disconnected` immediately deleted CallSession. ICE failure immediately failed. Route cleanup disposed the call/socket. Chat used broad `socket.off(event)` calls that removed another subsystem's recovery listener. | Connected calls retain their peer through a bounded signaling grace. New authenticated `call:resume` reattaches only an actually detached participant, after session/room/membership authorization. Previously unsent signaling is bounded and drained; stale generations cannot alter newer calls. ICE recovery remains caller-controlled and bounded. Chat removes only its own listeners. Transient SESSION_UNAVAILABLE handshake errors have five bounded retries (500/1000/1500/2000/2000ms), cancelled on explicit disconnect, with success resetting the attempt counter. Calls survive SPA navigation through a retained call store and tray; other rooms receive a separate transport so they cannot overwrite an active call's authorization context. Explicit hangup/room termination still close tracks and peers. |
| Hangup displayed a false failure | A late state acknowledgment could reject after registry removal but before the terminal event arrived. | An authoritative `INVALID_CALL` acknowledgment ends the matching local call, making late callbacks inert rather than labeling a completed hangup as a signaling failure. |
| Mobile header clutter | Account header contained appearance, bell and logout; these were not all in the existing mobile drawer. | Below768px, only brand and hamburger are visible. Existing mobile drawer contains navigation, segmented appearance, real unread bell and explicit Logout near its bottom. Auth/docs minimal headers gain a mobile drawer for their existing controls. Desktop infinite navigation remains intact. |
| Returning to an active call | Room metadata loaded before membership restoration completed; interim `isJoined=false` with a known expiry was treated as revocation. | Room readiness now gates eligibility updates. A global tray remains usable while loading, and visibility changes do not recreate the peer. A focused restoration regression test was added; browser return-to-room was rerun. |
| Theme selector | Appearance was a details dropdown. | Native three-way radio fieldset with Sun/Moon/Monitor icons, a sliding active surface, keyboard/focus states, reduced-motion fallback and existing persistence/system initialization. No reload, auth or socket action occurs on selection. |

These are reproduced code paths and local regression evidence, not a reconstruction of every production incident. No production logs or private traffic were accessed.

## Invitation state and migration

File: `docs/supabase-migration-v23.sql`. **Not applied to production.** Applied only in fresh isolated localhost databases, after the actual base schema and migrations v2–v22.

`nc_direct_pairs` has unordered user UUID keys, optional pending-invitation and active-room foreign keys, and a server-generated cooldown deadline. RLS is enabled; browser roles have no privileges. Existing RPC signatures and response shapes remain compatible. Private renamed base functions are not executable by browser roles or service_role; SECURITY DEFINER wrappers reuse them with fixed search paths. No unrelated records are modified and no existing column/table is removed.

Eligibility states returned to an authorized friend are available, pending (with actual expiry), active (with authorized room code/expiry), or cooldown (retry_at). Conflicts use HTTP409; expired acceptance remains410. There is no duplicate acceptance room creation. Group invitation behavior is preserved. Cancellation has no new public action because the existing product only exposed accept/decline.

The cleanup worker calls `nc_direct_pairs_sweep`; rows disappear when their cooldown and conversation/invitation references are no longer active. Sweep uses the same advisory key and does not race an in-flight pair mutation. Accepted conversation metadata is not retained after room cleanup. No message history or permanent conversation ID was added. Guest destruction does not depend on registered identity tables: account notification lookups are restricted to known registered room kinds, covered by a cleanup regression.

### Deployment prerequisites and order (operator only)

1. Review/back up the existing release and database schema. Confirm v22 history and the current function signatures. Do not run this migration blindly against an unexpected schema.
2. Inspect aggregate duplicate pending/active pairs. Existing duplicates are preserved; let those temporary invitations/rooms expire or handle their termination through authorized application actions. No automatic deletion/backfill is performed. Eligibility recognizes pre-migration pending invites and active rooms.
3. Apply reviewed v23 as a single transaction during an approved rollout. Its5s lock timeout aborts rather than blocks indefinitely. Record its version/checksum through the existing migration tool.
4. Deploy the backend before the frontend: new worker RPC, eligibility route, conflict mappings and `call:resume` must exist before clients use them.
5. Deploy the frontend only after backend readiness and isolated staging smoke tests. Preserve existing origin/cookie/proxy configuration and verify migrations, not real users' content.
6. Smoke test disposable staging accounts: ten brand clicks, refresh/network failure, both invitation directions, acceptance/rejection, same-room reopen, expiration, browser call/recovery/hangup and segmented themes.

### Rollback

Rollback frontend first, then backend to the saved `5677adb` release/artifact. Leave the additive v23 schema and RPC wrappers installed: the old RPC signatures remain available and pair/cooldown protection remains authoritative. Old backend versions may show generic errors for new pair conflicts and will not support resume; disclose that reduced behavior.

Do not automatically drop the pair table or restore unguarded invitation functions: that would erase cooldown state and reopen the race. If SQL rollback is required, stop invitation writes, preserve the pair data, review dependencies, and restore old functions from an approved schema backup in a separate reviewed transition. No rollback was executed against a hosted project.

## API, realtime and security

- New registered GET `/api/registered/invitations/eligibility/:username` derives the actor from verified cookies, validates friendship/block eligibility, and exposes only that permitted pair's state.
- `rooms:updated` is delivered to the existing private account socket channels, with only `{updated:true}`. Account IDs never enter its payload.
- New `call:resume` uses the existing call-reference schema, packet rate limits, session validation and membership checks. Connected competing tabs receive `OTHER_TAB`; third parties cannot resume another call. Room expiry is not extended.
- Registered room list remains scoped by authenticated account ID and active membership/expiry. No participant profile/avatar/last-message preview is fabricated or added.
- Diagnostics contain only transition reasons, sanitized error type/status and existing request IDs. No tokens/cookies/passwords/SDP/audio/private messages are logged.
- OpenAPI and public endpoint reference were regenerated from actual routes:74 operations, including the eligibility route and retryable503 behavior.

## Verification evidence and boundaries

### Automated checks

- Final full frontend suite:187 passing tests in37 files, zero failures. Includes room-list event/fetch reconciliation, transient handshake retry and refresh/logout ordering regressions.
- Full backend suite with five distinct localhost fixture DSNs:223 passed,2 opt-in browser tests skipped,30 files. All previously configuration-skipped SQL suites ran, including guest authorization, populated-schema migration compatibility, social concurrency, private media, account deletion and registered lifecycles.
- Opt-in browser call test:1 passed (32 sibling tests skipped only by the targeted name filter). Real Chromium peers exchanged synthetic audio over WebRTC/DTLS through real local Socket.IO; a controlled transport interruption recovered. The15-minute wall-clock soak reported every minute with both peers connected and exactly one peer connection each. Total execution932.34s. A subsequent fresh browser run also passed brand navigation away from the room and returning to the same ongoing call, after the restoration-readiness fix. This is localhost media verification with isolated room/auth fixtures, not TURN/internet proof.
- Separate ordinary guest entry browser test through the actual local backend/in-memory test adapter, **without API interception**:6 tests passed. Synthetic microphone media was used.
- Real PostgreSQL v2–v23 chains applied successfully to two new fixture databases. Both-direction pending/cooldown/active/expiry policies, concurrent invitation and acceptance, unrelated pairs, messages and cleanup passed. Exact cooldown deadline survived restart of the owned local PostgreSQL cluster.
- React regression: ten brand clicks, route changes and OLED selection retain the account and do not invoke Logout or disconnect sockets. Transient failures preserve account state; explicit/cross-tab logout and invalid sessions clear it.
- Browser UI fixtures tested all requested widths320,360,375,390,414,768,1024,1440: no horizontal overflow, only two visible mobile header controls, all three themes, unread notification count and Logout available in the drawer. Message popup was a body portal with no message/composer intersection; mobile sheet rendered. Desktop sidebar segment width was constrained to its actual246px grid column to prevent clipping. These account/room responses were explicitly browser fixtures, not real Supabase E2E results.
- TypeScript (including manual harness), ESLint, both production builds and `npm run docs:check` passed. `git diff --check` passed.

### Browser artifacts inspected

`output/playwright/stability/account-menu-390-oled.png`, `account-menu-1440-oled.png`, `message-menu-desktop.png`, `message-menu-mobile.png`; local synthetic voice screenshots are in `output/playwright/`. Artifacts are ignored and contain only isolated fixture data. Browser fixture scripts and the local database restart check are in the same ignored output directory.

### Harness corrections

The older opt-in browser test had stale jump-button/nav labels, immediate assertions during smooth scrolling and full-height expectations for an existing bottom sheet. Assertions now target current semantic controls and wait for real completed behavior. Float geometry measurements use integer rounding for44px targets. A local SQL assertion that inspected every direct room was scoped to its own fixture account to avoid parallel-test interference. A reused populated migration-test database was correctly rejected by the harness safety guard; a fresh empty localhost database was used for the successful full run. No test was disabled to obtain passing results. A real32px sheet-handle touch target discovered by the browser test was raised to44px.

## Remaining limitations / readiness

**Conditional staging/deployment readiness, not an automatic production approval.** v23 and backend-first rollout are mandatory. No production Auth/SMTP or ImageKit configuration changed or was retested; no real account was accessed. Local synthetic accounts use a minimal Auth schema for SQL compatibility, not a second Supabase project.

The current ICE factory supports STUN only (`VITE_WEBRTC_STUN_URLS`); there is no implemented TURN credential service. Restricted NAT/carrier/firewall combinations remain a real limitation. Secure integration requires an operator-provided TURN service and a membership-authorized backend credential endpoint minting short-lived HMAC credentials, with the shared secret kept server-side and relay URLs/temporary credentials returned only to eligible room participants. Credentials must be renewed for ICE restart; never put a long-lived shared secret in Vite variables. This approach is documented, not claimed implemented or deployed. No working TURN service is invented.

Existing env names remain unchanged: server `CLIENT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, ImageKit key/endpoint variables, session/call/rate-limit settings and any configured cleanup secret; client `VITE_API_URL` and optional `VITE_WEBRTC_STUN_URLS`. No new mandatory infrastructure variable is introduced by these fixes. Existing Node22-compatible scripts remain the build/start path.

Physical iOS/Android keyboard behavior, Wi-Fi→mobile handoff, Safari/WebKit, hardware trackpads, real microphone devices, wide-area TURN relay, multi-process call coordination and screen readers remain unverified. Call registry is process-local: server restart loses active signaling state; calls cannot be guaranteed to recover across that restart. Recovery is bounded by the existing disconnect grace and negotiation caps, not infinite retry. Internet reachability is not guaranteed.

New account UI flows were not tested against production Supabase. A staging pass with disposable accounts remains required before replacement. Production schema compatibility is established against repository migrations, not independently certified against the live catalog.

## Exact changed-file inventory

- `client/public/endpoint-reference.json`
- `client/public/openapi.yaml`
- `client/src/App.tsx`
- `client/src/components/account/AccountLayout.tsx`
- `client/src/components/call/PersistentCallTray.tsx` — new
- `client/src/components/call/VoiceCallUI.tsx`
- `client/src/components/common/Footer.tsx`
- `client/src/components/common/ThemeToggle.tsx`
- `client/src/components/mobile/ResponsiveActions.tsx`
- `client/src/components/navigation/FloatingHeader.tsx`
- `client/src/components/rooms/TemporaryChatButton.tsx` — new
- `client/src/components/rooms/TemporaryRooms.tsx` — new
- `client/src/hooks/useAccount.tsx`
- `client/src/hooks/useConnectionStatus.ts`
- `client/src/hooks/useSocket.ts`
- `client/src/hooks/useVoiceCall.ts`
- `client/src/lib/account.ts`
- `client/src/lib/active-calls.ts` — new
- `client/src/lib/socket.ts`
- `client/src/lib/voice-call.ts`
- `client/src/lib/webrtc.ts`
- `client/src/pages/AccountPages.tsx`
- `client/src/pages/ChatPage.tsx`
- `client/src/pages/LandingPage.tsx`
- `client/src/pages/TemporaryPages.tsx`
- `client/src/styles/stability.css` — new
- `client/src/tests/account-navigation-ui.test.tsx`
- `client/src/tests/account-refresh.test.ts` — new
- `client/src/tests/account-session-ui.test.tsx`
- `client/src/tests/auth-ui.test.tsx`
- `client/src/tests/call-restoration.test.tsx` — new
- `client/src/tests/call-retention.test.ts` — new
- `client/src/tests/deletion-recovery-ui.test.tsx`
- `client/src/tests/desktop-header.test.tsx`
- `client/src/tests/footer.test.tsx`
- `client/src/tests/message-position.test.ts` — new
- `client/src/tests/room-list-reconciliation.test.tsx` — new
- `client/src/tests/room-transport.test.tsx` — new
- `client/src/tests/temporary-room-ui.test.tsx` — new
- `client/src/tests/voice-call.test.ts`
- `docs/NULLCHANNEL_STABILITY_FIXES.md` — new
- `docs/openapi.yaml`
- `docs/supabase-migration-v23.sql` — new
- `scripts/generate-api-docs.mjs`
- `server/src/middlewares/error.middleware.ts`
- `server/src/routes/account.routes.ts`
- `server/src/routes/registered-room.routes.ts`
- `server/src/services/account.service.ts`
- `server/src/services/cleanup.service.ts`
- `server/src/sockets/call.socket.ts`
- `server/src/sockets/room.socket.ts`
- `server/src/tests/account.test.ts`
- `server/src/tests/burn.test.ts`
- `server/src/tests/call.integration.test.ts`
- `server/src/tests/cleanup.test.ts`
- `server/src/tests/direct-pairs.database.integration.test.ts` — new
- `server/src/tests/registered-route-boundary.test.ts`
- `server/src/tests/sql/direct-pairs.sql` — new
- `server/src/tests/sql/registered-rooms.sql`
