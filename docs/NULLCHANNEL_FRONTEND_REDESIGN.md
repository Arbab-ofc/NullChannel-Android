# NullChannel frontend redesign

Branch: `feat/nullchannel-frontend-redesign`, based on verified upgrade commit `708a5c5`. Local frontend work only; no production, backend, schema, Auth or ImageKit changes authorized.

## Audit and feature inventory

React 19 + TypeScript + Vite 7; Tailwind 3 semantic HSL variables; Lucide icons; Framer Motion already installed. React Router lazy-loads pages. `main.tsx` initializes the guest session, ThemeProvider and BrowserRouter; App wraps AccountProvider/ErrorBoundary. Existing favicon remains intact.

| Surface | Implementation and contracts preserved |
| --- | --- |
| Home, features | LandingPage: guest private/group create, eight-character join code, 15/60/360/1440-minute options (default 1440), display name, room name, active guest rooms. `api /rooms`, `/users/:sender/rooms`; sessionStorage aliases. |
| Auth | AuthPage: signup, login, forgot/reset password; exact field constraints, neutral feedback, safe next redirects and recovery hash token exchange. `accountApi /account/*`; HttpOnly backend cookies. |
| Account shell | AccountLayout route protection, pending-deletion restriction, logout, notifications and all eleven navigation destinations. |
| Dashboard/social | AccountPages: presence, friend search/requests/actions/block/remove, account profile/bio/username cooldown, avatar upload/remove, privacy preferences, notifications, password/account deletion, privacy session/cleanup state. `accountApi /social/*`, `/account/*`, `/notifications`, `/registered/privacy`, `/registered/rooms`. |
| Rooms/matching | TemporaryPages: group/public room creation, category/tags/capacity, Explore filters/pagination/join, friend/invite-link invitations, 60-second search and separate proposal deadline/acceptance. `/registered/*`, `/match/*`. |
| Chat | ChatPage: guest/registered identity mapping, join/leave, history, ordered realtime messages, typing, scroll/unread, text, reply, editing/deletion, pin, reactions, panic wipe, terminate/extend expiry, member/gallery panels, invitations and room navigation. Existing REST `/rooms/:code/*` and sockets unchanged. |
| Temporary media | Upload image/file/voice notes, protected media URLs, view-once opening, timed/Burn expiration; existing size/type restrictions and recording/call exclusion remain. `temporary-media.ts`, ViewOnceMedia, `/media/*`. |
| Voice | useVoiceCall/voice-call/webrtc, VoiceCallUI: invite/accept/reject/cancel, permission feedback, mute, playback recovery and resource cleanup. One-to-one only, no group/TURN claims. |
| Group/ghost | GroupTools polls, voting/closing, moderation, hashed invite creation/revocation; matched-room mutual reveal/connect/block/skip. Existing registered endpoints and ownership checks remain. |
| Documentation/other | DocsPage topic/search/deep-link/download, EndpointReference copy/examples; terms/security routes and NotFoundPage. Generated API documents are contracts, not design fixtures. |
| Realtime/session | useSocket retains WebSocket-only credentialed connection, accountSocket presence heartbeat; account generation guards, refresh interceptor, cross-tab logout, guest renewals remain. Chat events: receive-message, typing, room/member/destruction and call:*; social: friend:*, notifications:update, invitation:received, directory:updated, match:status, identity:consent, poll:update, moderation:update. |
| Layout/accessibility | useVisibleViewport, transcript-scroll, seen-message observer, NavigationOverlay native dialog with focus restoration, Modal native dialog, safe areas and reduced-motion CSS. |

Existing frontend suite: 84 tests across 22 files, including Auth forms, protected session state, API/socket behavior, voice races, viewport/scroll/seen-message logic, group tools, docs and privacy. Backend contracts are reference-only in this task.

## Design direction

Visual thesis: a quiet violet editorial canvas with rounded conversation surfaces, crisp vector orbit artwork and a few offset neo-brutalist accents.

Content plan: brand-first hero and clearly labeled interactive local preview; guest entry; real capability bento; journey; accurate persistent/temporary principles; FAQ and final CTA. Account views remain practical workspaces, not marketing pages.

Interaction thesis: short hero entrances; one-time section reveals; immediate button/menu/dialog feedback. Reduced motion disables decorative movement. No endlessly moving ambient effects.

Two self-hosted typefaces: Space Grotesk headings, Inter body. Charcoal dark and warm off-white light surfaces, violet primary action, cyan secondary detail, semantic danger/success colors. Persist explicit preference, follow system otherwise, apply theme before first paint. SVG stickers replace interface-authored emoji; existing reaction wire values remain encoded and render as named Lucide icons. User-authored message content is preserved without rewriting it.

## Implementation sequence and regression risks

1. Inventory, tokens, theme startup and shared Button/Brand/illustration primitives; validate theme persistence/system/storage failure.
2. Header/footer, home and guest forms; preserve defaults and API payloads, exercise keyboard/menu/modal flows.
3. Auth/account shell/dashboard and remaining forms; retain handlers and input constraints, run existing UI tests.
4. Chat presentation, reactions and dialogs; preserve transport/lifecycle/media/voice logic, test composer/history/scroll and native modal behavior.
5. Responsive/motion/accessibility pass; browser screenshots in both themes, build/typecheck/lint/client suite. Document layers of verification honestly.

Primary risks: CSS overriding dynamic viewport geometry; excessive composer height on short screens; focus restoration across nested menus/dialogs; theme startup under production CSP; reaction glyph values accidentally changing backend requests; shared Button styling changing destructive affordances. No API client, socket protocol, database migration or backend security edits are planned.

## Validation and preservation checklist

Implementation and final results are recorded here as the work progresses. Browser checks use isolated local fixture infrastructure where necessary; they must never point to the production Supabase project or execute shared cleanup. Existing real-integration evidence predates this redesign and is not presented as a rerun.

### Delivered design system and surfaces

- Semantic dark/light surface, text, accent, danger and success tokens; spacing, typography, radii, elevation and motion tokens in `client/src/styles/design-system.css`. Responsive behavior follows 430/640/768/1024/1280 breakpoints, with bounded layouts up to 1920px.
- Self-hosted OFL Inter and Space Grotesk variable fonts (Latin subsets, approximately 70.55 kB combined). Existing logo/favicon preserved through Brand; developer attribution retained.
- Reusable Button variants, Brand, EmptyState, SignalArt, ProductPreview, theme helpers and SVG reaction presentation. Original SVG orbit/sticker and empty-conversation artwork; no image generation or remote stock assets.
- Floating public navigation, native mobile menu, rewritten homepage, guest entry, bento capabilities, privacy principles, FAQ, final CTA and responsive footer. Product preview is explicitly labeled sample content, operates locally, and never represents a real delivered message.
- Account sidebar and mobile dialog, dashboard, Auth story/form layout, all account/social/privacy/notification pages through shared Page/Field/primitives; public discovery, invitation empty states and matching visual; docs and not-found presentation.
- Chat left context rail on desktop, compact mobile header, timestamped/grouped incoming and outgoing bubbles, rounded controlled-height composer, semantic danger states, accessible attachment inputs and named SVG reactions. Required-name and expiry interfaces now use the existing native Modal with initial/restored focus.
- Motion: CSS hero entrances, native one-time section observer, scene/route/message entrances, menu/modal transitions and restrained hover/theme feedback. Reduced motion disables decorative transitions/animation. No continuous ambient effects or new animation dependency.

### Preservation checklist

| Behavior | Change boundary / evidence |
| --- | --- |
| Authentication, cookies, restoration and logout | Auth submit handlers, safe-next logic, AccountProvider and API refresh clients unchanged. Existing Auth/session UI tests passed. No real Auth emails/accounts created in this redesign. |
| Guest creation/defaults/join | Existing POST payload and 24-hour default preserved. Actual browser form sent the existing payload and showed failure feedback when the isolated fixture rejected its unsupported create RPC. Seeded-room joining and two-client exchange passed. Creation against Supabase was not repeated. |
| Registered room/social/ghost/group/privacy features | Existing API paths, handlers, form names, defaults and constraints retained; backend authorization unchanged. Existing frontend group/privacy/account tests passed. Registered browser page layout used clearly isolated response fixtures. |
| Realtime, history, ordering and reconnect | No API/socket library or lifecycle hook changed. Actual Socket.IO message exchange passed against local Express routes plus the test-only memory adapter. Existing socket, message, scroll, seen-message and voice race tests passed. |
| Reactions | Five existing Unicode wire values retained as escaped source literals. Named SVG picker and badge passed a local authorized REST 200 round trip; request value matched the existing contract. UI/docs display no pictographic reaction glyph. JSON escaping round-trips to the unchanged contract. |
| Media and voice | Upload/download/recording/view-once/call handlers and all file restrictions retained. Attachment inputs are now keyboard reachable. Existing relevant client tests passed; real ImageKit, Supabase and microphone/NAT paths were not invoked. |
| Timed/Burn messages and destruction | Existing expiry/seen/termination logic retained. Browser checked lifetime select, Burn toggle and expiry modal. Server-enforced deletion was not retested and no production cleanup ran. |
| Navigation and accessibility | Every account destination retained, with active-route test. Native menu focus containment/Escape restoration, create modal focus and expiry dialog verified in Chromium. Field labels now use explicit associations and hint descriptions; selected lifetimes announce pressed state; creation errors announce via role=alert. |

Interface-authored labels, stickers, errors and displayed documentation examples contain no emoji. User-authored message/profile content remains unchanged rather than being silently filtered; Unicode reaction payloads remain part of the existing backend contract. Downloadable API documents retain that contract.

### Executed checks

| Command / check | Final result |
| --- | --- |
| `npm run test --workspace client` | **93 passed, 0 failed, 0 skipped; 25 files**. Includes the original 84 plus 9 redesign/theme/navigation regressions. Earlier intermediate test/build failures were fixed (raw HTML test import and browser script globals). |
| `npm run lint --workspace client` | PASS. |
| `npm run typecheck --workspace client` | PASS. |
| `npm run build --workspace client` | PASS. Route CSS remains split; homepage JS approximately 19.62 kB / 6.30 kB gzip; main approximately 380.08 kB / 124.05 kB gzip. These are build sizes, not a mobile latency benchmark. |
| `npm run docs:check` | PASS: 73 actual HTTP operations remain consistent. No generated API contract changes. |
| `npm audit --omit=dev --json` | 0 production vulnerabilities reported at review time. The install still reported 5 existing high development-tooling findings; no unrelated forced dependency upgrades were performed. |
| Chromium responsive checks | **462 unique route × width × theme checks** across 21 routes and all 11 requested widths, both themes. Final observations: no horizontal overflow, incorrect theme, error-boundary render, interface emoji or JavaScript page error. An initial 320px account header overflow was corrected and all 42 width/theme/route combinations at 320px retested. |
| Short/landscape chat | 10 focused combinations, including 390×430 and 844×390, both themes: composer remains within viewport, transcript has positive height, no clipped composer controls. This is browser viewport verification, not a physical virtual-keyboard test. |
| Browser interaction checks | Mobile menu focus/Escape, create-modal focus restoration, theme persistence after reload, reduced motion, expiry dialog and SVG reaction presentation passed. |
| Core text-token contrast | 20 foreground/surface/theme pairs measured in Chromium; minimum **5.77:1**. Does not certify every blended state or full WCAG 2.2 AA. |

### Browser evidence and safety

Browser used Playwright CLI against `http://127.0.0.1:5178` and the repository's `npm run voice:manual` fixture. It strips provider environment inputs, substitutes its explicit test-only Supabase adapter and disables media provider operations. No production backend, database, SMTP, ImageKit or VPS was contacted for these UI checks. Registered layouts used browser-only fixture responses for account/list/discovery data; those responses are not present in production source. Mocked layout coverage is not reported as real registered-feature E2E.

Guest creation in this fixture returns 500 because `create_room` is deliberately absent from its adapter; the frontend payload/default/error feedback were verified, and real Socket.IO delivery used its seeded room. Actual Auth/signup and provider-media workflows remain outside this local-only task. The operator must validate those in an approved isolated environment before deploying the redesign; previous verified upgrade evidence does not certify this new UI end to end.

The first screenshot sweep captured some lazy-route loading frames. It was discarded as final evidence and rerun waiting for route headings, account restoration and loaded endpoint documentation. Representative mobile/tablet/desktop screenshots were visually inspected. Artifacts are ignored local files under `output/playwright/redesign/`:

Fixture logs included expected unauthenticated account-probe 401s, the unsupported creation RPC 500, and development Vite WebSocket EPIPE/ECONNRESET messages during rapid full-page navigation/disconnects. These were not concealed as zero console/network errors. Final matrix results reported zero JavaScript `pageerror` events; actual seeded-room message delivery and the reaction REST round trip passed. This does not establish production proxy/network reliability.

- `responsive-summary.json`: final deduplicated 462-check matrix summary.
- `results-320.json`, `results-430.json`, `results-1024.json`, `results-320-final.json`: detailed observations; the final 320 file supersedes earlier 320 findings.
- `interactions.json`, `reaction.json`: interaction, contrast, composer and reaction evidence.
- Final homepage: `home-final-desktop-dark.png`, `home-final-desktop-light.png` (full page), `home-final-tablet-light.png`, `home-final-mobile-light.png`.
- Account, Auth, Explore, matching, settings and docs screenshots at 390/768/1440 in both themes; 320px follow-up screenshots; chat screenshots including short and landscape-related layouts.

Screenshots are local artifacts, not committed production assets. The test fixture/browser were stopped after verification; memory-only room/message/reaction records disappear with the harness. No disposable hosted accounts or files were created.

### Modified files and remaining limits

35 source/documentation files: frontend pages/layouts/common controls/theme hook/main/index; three presentation CSS files and legacy-style cleanup; four reusable presentation components plus ReactionIcon; two helpers and blocking theme script; three new test files; client manifest/root lockfile and this report. Backend source, API clients, session/socket/voice/scroll hooks, migrations and production settings are unchanged.

Physical mobile keyboards, real microphone/NAT behavior, full screen-reader/accessibility review and new provider-backed E2E are **unverified for this redesign**. The isolated harness cannot verify account persistence, media upload/deletion or room-creation SQL. No claim of complete anonymity, end-to-end encryption, instantaneous provider erasure, exactly-once delivery or universal voice connectivity was introduced. Long-history pagination/virtualization was not changed.

For a future approved deployment, include the complete build, including `theme-init.js` and hashed self-hosted font assets; the initializer requires no inline-script CSP exception. Do not deploy partial CSS or mixed frontend/backend artifacts. This branch remains local and uncommitted; no push, merge, deployment or production configuration change was performed.
