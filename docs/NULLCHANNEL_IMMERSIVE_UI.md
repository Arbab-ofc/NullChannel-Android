# NullChannel immersive UI upgrade

Branch: `feat/nullchannel-immersive-ui`. Date: 12 October 2026.

## Scope and audit

The branch was already active and the worktree was clean. No branch was created or switched. This change is frontend-only; backend, migrations, authentication, Socket.IO contracts, provider integration, environment and deployment configuration remain unchanged. No dependency added. No commit, push, merge or deployment.

Inspected App/routes, ThemeProvider/theme utility/pre-paint initialization, LandingPage/ProductPreview/SignalArt, shared dialogs/loading/skeleton/error controls, ChatPage and expiry, ActiveRoomsSection, public discovery/registered room creation, documentation clipboard controls, and existing tests. Read the existing room service/registered route response shapes and lifecycle documentation without changing them.

Actual integration findings:

- Existing themes were light/dark, with a saved `nullchannel_theme` preference and system fallback. A blocking same-origin initializer runs before React.
- Existing hero/product preview uses clearly labeled sample conversations, not real account messages.
- Guest room previews receive code, name, type and expiry. They receive neither member totals nor message previews. The existing six-entry category preview is retained.
- Public discovery returns authorized `participants`, `capacity`, `expires_at`, `created_at` and room classification metadata; no message bodies.
- Room details already include `created_at` and `expires_at`. The old frontend Room type omitted the creation timestamp; the new optional field consumes the existing response rather than changing it.
- Guest classification is private/group. Registered kinds include direct/group/public/match. There is no separate Ghost Room type.
- Existing room lifecycle revokes access at termination; durable database/provider deletion may continue. Privacy visuals must communicate this distinction.
- Existing copy actions await `navigator.clipboard.writeText`; new confirmation controls reuse the operation and retain existing toast/error callbacks.

## Features implemented

| Feature | Implementation and constraints |
| --- | --- |
| Kinetic typography | Four independently staggered spans inside one semantic h1; transform/opacity entrance, stable layout, readable fluid typography, static reduced-motion fallback |
| Floating previews | Existing interactive sample chat plus two lightweight illustrative vector layers; CSS perspective and bounded float animation, no real private messages; perspective/float disabled on mobile |
| Section dividers | Lightweight custom SVG paths/gradient/circle, theme tokens, finite subtle motion, decorative semantics, no horizontal overflow |
| Theme transition | Background/surface/text/border/shadow transitions enabled after theme initialization; no transition gates on first-paint initializer; existing system theme detection retained |
| Illustrations | Shared original orbit/error/success SVG primitive, unique gradient IDs and token-based fills/strokes; decorative or explicitly labeled |
| OLED | Third explicit appearance radio choice; true-black primary background, controlled raised surfaces, same saved preference and pre-paint initializer; overlays and pages use shared tokens |
| Branded loading | Existing LoadingSignal enhanced with SVG and inline/button/page variants; App lazy fallback uses page variant; loading labels and actual loading logic retained |
| Illustrated errors | 404 and ErrorBoundary use custom error artwork; existing messages, reload/home actions and error behavior retained |
| Animated toggles | Native checkboxes with animated decorative track/thumb; existing settings names/defaults and view-once onChange/disabled conditions retained; native keyboard and FormData semantics |
| Skeleton shimmer | Existing skeleton shapes receive theme-aware shimmer; genuine loading/error/empty distinctions retained; reduced motion disables shimmer |
| Copy confirmation | Shared CopyButton in chat, group invite and documentation controls; checkmark only after successful write; 2-second reset, failure feedback, stale-completion and timer cleanup guards |
| Creation success | Existing successful guest/registered creation handlers add a transient router marker; shared SVG status appears on destination immediately and expires after 1.8 seconds; no request duplication or navigation delay |
| Room atmosphere | Existing private rooms: violet; group/public: blue/cyan; direct temporary: fading spatial gradient; existing anonymous match: monochrome; unknown: neutral. No new data model or identity-reveal logic |
| Expiry timeline | Existing room timestamps; clear seconds countdown, conditional circle when valid creation/deadline supply a denominator, actual urgency under 5 minutes, expired/invalid/missing/null handling, one-second tick stopped at expiry |
| Privacy journey | Interactive Create → Connect → Chat → Expire steps; static-readable descriptions and selected-step announcement; cleanup lag and copies outside application explicitly disclosed |
| Dynamic room cards | Existing guest room previews now show actual name/type/code and valid absolute expiry; duplicate codes removed. Public discovery retains actual participant/capacity data and expiry. No new history request or unauthorized preview |

Framer Motion remains available but no import was needed: transform/opacity/CSS transitions cover these interactions without adding its runtime to these page chunks. Float/divider/urgency decorations use finite animation cycles; loading shimmer/spinner runs only while loading. Reduced motion removes decorative motion.

## Intentional omissions

- No Ghost Room schema/type is introduced. Monochrome styling applies only to known `room_kind=match`; the existing Ghost Mode preference/API is untouched.
- No last-message preview: existing room-list/directory responses do not contain authorized message text. No extra endpoint or history fetch was added.
- No fabricated private/group member counts. Public discovery uses only its already-provided, valid participant count.
- No circular expiry percentage when creation timing is missing, invalid, future-dated or after expiry. A timer icon/text remains instead. Small 320px headers keep text and omit the decorative circle to preserve control space.
- Defensive null-expiry display does not create or advertise permanent rooms; the actual product still requires finite lifetimes.
- No physical-device certification, real production database test, provider upload test or fresh authentication audit.

## Correctness and fixes during verification

1. The new ring exposed the old fixed-width chat expiry container: timestamp text overlapped the mobile menu. The container now sizes to its actual content. Browser geometry checks confirm no overlap across tested widths and themes.
2. The decorative toggle track intercepted direct input hit testing. The invisible native input now covers the full label/touch target while the decorative thumb reflects native checked state. Real browser checked/uncheck behavior and native form serialization pass.
3. An incomplete successful HTTP response could otherwise close the guest creation form before navigation. Creation code validation now happens before clearing the form/cache state; a missing code retains the error form and never shows success. Valid API request payloads and successful flow remain unchanged.
4. Tests initially inspected the Lucide timer's decorative circle as though it were a progress ring. They now inspect the actual progress pathLength marker. CSS raw imports were initially stubbed by Vitest's default CSS exclusion; a narrowly scoped test CSS include enables the real immersive stylesheet assertions without adding Node dependencies to frontend types.
5. Browser automation initially checked copy state before the asynchronous clipboard promise completed. A subsequent actual browser write, awaited confirmation, readback of the disposable room code and automatic reset passed. No success is inferred from a click alone.

## Test results

Commands run:

```sh
npm --prefix client test
npm --prefix client run typecheck
npm --prefix client run lint
npm --prefix client run build
```

Final full frontend suite: **139 passed, 0 failed, 0 skipped, 29 files**. Baseline: 122 tests. Added 17 focused tests for OLED persistence/pre-paint/system compatibility, clipboard pending/success/failure/stale results/reset, type mapping/unknown fallback, expiry validity/progress/deadline, unavailable room metadata, duplicate cards, native toggle handlers/form submission, privacy/semantic heading, loading variants, creation success/rejection/incomplete responses.

Typecheck, ESLint and production build passed. Lazy page chunks retained. Main JS is approximately 126.5 kB gzip; landing page 8.23 kB gzip; chat 28.23 kB gzip. No dependency addition or production build artifacts tracked.

## Browser and visual verification

Used Playwright CLI against the existing isolated `npm run voice:manual` harness on localhost. Its launcher strips Supabase/ImageKit/provider variables and uses the repository's in-memory adapter. No production data was read or written by these automated tests.

- Landing: 320, 375, 390, 430, 768, 1024, 1440px in light/dark/OLED: **21 combinations**, no horizontal overflow. Theme choice exercised through the actual appearance picker.
- OLED: computed body and chat background `rgb(0, 0, 0)`; saved preference `oled`; reload restored OLED with dark browser color-scheme.
- Reduced motion: actual computed headline and preview animation names `none`.
- Privacy journey: selecting Expire showed the access-revocation/cleanup-lag explanation.
- Chat: 320, 390, 768, 1440px in all three themes: **12 combinations**, composer/send visible and no horizontal overflow. Final checks also confirmed no expiry/menu overlap in all 12 combinations; seven OLED header widths checked separately.
- A local message traveled through the actual isolated Express/Socket.IO flow and rendered. This is scoped local messaging evidence, not a fresh full feature/authentication/voice audit.
- Creation success browser check used an explicitly labeled **201 response fixture** because the local in-memory harness does not implement `create_room`. Exactly one request, navigation and confirmation were observed. Unit tests cover rejection/incomplete response. This does not claim real Supabase room creation was retested.
- Clipboard used actual browser permissions/write/readback for disposable `TEST1234`, then reset to Copy Channel ID. Rejected clipboard operations are tested with unit mocks, not claimed as actual provider failures.
- Native view-once checkbox checked and unchecked successfully after the hit-target correction.
- OLED session overlay, documentation and illustrated 404 rendered; docs/404 mobile widths had no overflow.
- Screenshots at mobile/tablet/desktop and light/dark/OLED were captured. Representative landing, privacy journey, chat, overlay and error screenshots were actually inspected.
- Expected isolated-harness console events include guest account-probe 401 and development socket teardown warnings. Landing page reported no JavaScript page errors. No console message was hidden to obtain a pass.

Local ignored artifacts: `output/playwright/immersive-ui/`.

Representative files: `landing-light-390.png`, `landing-dark-1440.png`, `landing-oled-768.png`, `privacy-journey-oled.png`, `chat-oled-390.png`, `chat-light-1440.png`, `oled-session-overlay.png`, `copy-confirmation-oled.png`, `docs-oled-mobile.png`, `error-oled-mobile.png`. The CLI scripts are retained in the same local artifact directory.

## Preservation checklist

- Existing logo, name, fonts, API clients, authentication restoration, guest session initialization and account preferences APIs retained.
- Existing message send/edit/delete/reply/reaction, recording/call, timed/Burn/view-once and room membership/termination handlers retained.
- Existing Unicode reaction payloads unchanged; no authored UI emoji added.
- Existing room creation request endpoints/bodies/defaults retained. Success navigation remains immediate after confirmed response.
- Existing clipboard values and relevant toast/error handling retained.
- Existing theme preference key and system fallback retained; OLED is a local preference only.
- Existing skeleton dimensions, error messages/retry paths and permission gates retained.
- No new socket connection, contract, backend field, database write, migration, dependency or production configuration change.

Passing frontend tests and unchanged contracts support preservation. They do not certify every production backend workflow anew.

## Modified files

Existing files:

- `client/public/theme-init.js`
- `client/src/App.tsx`, `client/src/main.tsx`
- `client/src/hooks/useTheme.tsx`, `client/src/lib/theme.ts`
- `client/src/components/common/ThemeToggle.tsx`, `LoadingSignal.tsx`, `ErrorBoundary.tsx`, `EndpointReference.tsx`
- `client/src/components/chat/ExpiryCountdown.tsx`, `GroupTools.tsx`
- `client/src/components/rooms/ActiveRoomsSection.tsx`
- `client/src/pages/LandingPage.tsx`, `TemporaryPages.tsx`, `ChatPage.tsx`, `AccountPages.tsx`, `DocsPage.tsx`, `NotFoundPage.tsx`
- `client/vitest.config.ts`

New files:

- `client/src/components/common/CopyButton.tsx`, `ToggleSwitch.tsx`
- `client/src/components/immersive/Illustration.tsx`, `LandingMotion.tsx`, `RoomCreatedFeedback.tsx`
- `client/src/components/rooms/RoomCard.tsx`
- `client/src/lib/room-presentation.ts`, `room-creation.ts`
- `client/src/styles/immersive.css`
- `client/src/tests/immersive-ui.test.tsx`
- This report.

## Remaining risks and manual checks

- Physical iPhone/Android/tablet keyboard, native browser back, battery/GPU and OLED panel behavior were not tested. Desktop geometry cannot certify them.
- Recheck Appearance picker radios, Escape/Tab, nested session controls, device rotation, reduced motion, VoiceOver/TalkBack and forced-colors mode on devices.
- Validate real creation success/error on an approved non-production backend; use disposable accounts/rooms. The browser creation case here is a frontend response fixture.
- Test expiry extensions and device clock skew with authorized development sessions. UI uses the device clock, as the previous countdown did; backend remains authoritative for expiry/access.
- Review group/public/direct/match atmosphere on real non-production rooms. Mapping is unit-tested; actual local browser room was guest/private.
- Clipboard failures can occur outside secure contexts or under permissions restrictions. Manual-selection fallback remains documented and failures never show success.
- Native checkbox interaction is preserved, but a full WCAG audit and physical screen-reader review were not performed.
- No production readiness or deployment claim is made by this presentation-only upgrade.
