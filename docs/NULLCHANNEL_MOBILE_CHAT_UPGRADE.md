# NullChannel mobile and chat upgrade

Date: 12 October 2026. Branch: `feat/nullchannel-mobile-chat-experience`.
Base: `feat/nullchannel-frontend-redesign`, commit `6ec6fce`.

## Scope and safety

Frontend presentation and interaction changes only. No backend, migrations, database, provider configuration, environment configuration, production services or deployment changes. No commit, push or merge. Public branding remains NullChannel. No new dependency.

## Audit and architecture

The initial worktree was clean. The redesign commit was verified before creating the feature branch. The audit covered routes, account/guest clients, room controls, message actions, media handlers, socket lifecycle, viewport/scroll hooks, CSS, dialogs and existing tests. Audit findings and regression risks were presented before editing.

React 19/TypeScript/Vite with lazy React Router pages, Tailwind and semantic violet/charcoal/warm-white tokens. Existing native dialogs provide browser top-layer focus trapping. The guest and account Socket.IO clients are retained. Registered identity restoration remains in AccountProvider; anonymous identity initialization remains in main/session code.

| Existing feature | Implementation and preservation boundary |
| --- | --- |
| Public/home/docs/auth routes | App lazy routes, LandingPage, AuthPage, DocsPage; auth API and redirects unchanged |
| Account navigation | AccountLayout, AccountPages; all existing sidebar/drawer destinations retained |
| Guest creation/join | LandingPage and ChatPage; existing REST handlers and defaults retained |
| Temporary registered rooms | TemporaryPages, GroupTools; existing account API and authorization retained |
| Text/replies/edit/delete/pin | ChatPage handlers and message payloads retained; swipe calls existing startReply |
| Reactions | Existing Unicode payload values retained; visible ReactionIcon SVGs unchanged |
| Burn/timed/view-once | Existing deadlines, seen observer and media access components retained |
| Uploads and voice notes | Existing Axios upload requests and recording lifecycle retained; image/file selection now previews before explicit upload |
| Voice calls | Existing call hook, signaling, microphone handling and UI retained |
| Friends/notifications/privacy/match | Existing page handlers, account API and account socket subscriptions retained |
| Scroll/read behavior | TranscriptScroll owns following, unread and anchors; useSeenMessages owns existing seen behavior |
| Appearance | Existing ThemeProvider, stored preference, first-paint initialization and tokens retained |

Routes include `/`, `/features`, `/docs`, `/security`, `/terms`, `/chat/:code`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/dashboard`, `/friends`, `/friends/requests`, `/explore`, `/explore/create`, `/groups/create`, `/match`, `/invitations`, `/notifications`, `/privacy`, `/profile`, `/settings`, `/404`. There is no dedicated permanent Chats route.

Primary regression risks: gesture versus transcript scrolling, viewport resizing versus older-message anchors, overlapping native dialogs, unsafe retry after an uncertain provider upload, and accidental remount/focus changes during route transitions.

## Implemented interactions

| Requested feature | Implementation | Verification |
| --- | --- | --- |
| Mobile keyboard | Extended existing viewport hook; scale-one VisualViewport height/offset, focus-aware keyboard heuristic, compact composer; sheet keyboard offset | Unit tests, desktop browser geometry; physical keyboards unverified |
| Jump to latest | Existing controller adds distance state; floating SVG button, existing unread Set; smooth scroll with user-interruption handling | Unit tests and two-context local Socket.IO workflow |
| Floating date | IntersectionObserver on actual message timestamps; first intersecting message in DOM order; local-calendar label | Observer/date/empty unit tests; browser date pill inspected |
| Swipe reply | Pointer Events; calls existing reply handler; deliberate rightward intent, control/modal/edge exclusions | Unit tests and Chromium CDP touch gesture |
| Attachment preview | Image object URL or file icon, name/type/size, remove, explicit send, actual Axios progress, failure state | Unit tests; browser thumbnail/file/remove and actual isolated backend 503 |
| Connection status | Existing socket and Manager lifecycle; connected/reconnecting/offline plus session/join errors | Listener cleanup unit test; actual socket disconnect/reconnect browser check |
| Bottom navigation | Account-only Home, Sessions (`/privacy`), Explore, Alerts, Profile; active route and keyboard hide | Unit tests, account UI fixture browser checks |
| Bottom sheets | Mobile attachment selection, message actions and session/appearance controls; desktop popover/navigation retained | Dialog tests, browser Escape/reply/file preview/session controls; screenshots |
| Pull refresh | Existing refresh functions on guest room list, Friends, Notifications, Privacy sessions and Explore; single-flight gesture; explicit button | Threshold/cancellation/failure/dedup tests; Chromium touch request count 2 to 3 |
| Edge navigation | Native browser back/forward retained; 24px screen edges excluded from custom reply/refresh gestures | Edge exclusion unit tests; native device gestures unverified |
| Skeletons | Shared theme-aware rows for account restoration/profile, account lists, Explore and empty loading chat history; existing guest room skeleton retained | Accessibility structure test and existing page regression tests |
| Empty states | Existing original SVG reused; contextual messages/friends/notifications/guest rooms; errors never replaced by empty copy | Component/page regression tests and account fixture browser inspection |
| Page transitions | Short opacity/transform entrance; lazy-route heading focus; chat/auth exemptions; reduced-motion CSS | Focus unit test; actual browser reduced-motion computed animation `none` |

### Gesture policies

- Reply activation: rightward displacement at least **64px**, greater than **1.5 × absolute vertical movement**. Visual travel is damped to 75%, capped at 84px. Vertical movement exceeding 12px and dominating horizontal movement cancels. Pointer cancellation/lost capture cancels. One callback on release, not one per move.
- Reply excludes non-touch pointers, non-primary pointers, unreplyable/deleted messages, interactive targets, open dialogs and the outer **24px** screen edges. Existing options-menu Reply remains accessible without gestures. No haptics or vibration are enabled.
- Pull refresh: downward displacement **72px**, horizontal-intent ratio 1.5; visual indicator capped at 92px. Requires document top, one touch, no open dialog, no nested scroll area or interactive origin. Prevents default only after downward intent on a cancelable event. One in-flight gesture request. API list hooks deduplicate same-path requests.
- iOS retains native pull refresh because competing with Safari gestures cannot be certified locally. Explicit Refresh remains available. Lists below the document top use their Refresh button instead of capturing native page scrolling.
- Safe edge navigation is intentionally native. No custom history stack, interception of OS back gestures, or navigation away from drafts is introduced.
- Sheet swipe dismissal is restricted to the handle, with **64px** downward intent. Nested content scroll gestures do not dismiss it. Destructive confirmations retain existing confirmation behavior and are not swipe-to-confirm dialogs.

### Keyboard and scroll strategy

One existing viewport utility is extended rather than adding a second calculation algorithm. Resize/scroll/focus events are coalesced through requestAnimationFrame; subscriptions are released on unmount. Pinch zoom keeps native viewport behavior. Without VisualViewport, existing `100dvh` layout remains the fallback.

Keyboard visibility is a heuristic: editable focus plus a reduction greater than 120px from the available layout baseline at scale one. It controls bottom navigation visibility; it is not a connectivity signal. Compact chat spacing follows the actual visible height below 500px, not only CSS layout viewport height. Sheets use the visible height and bottom offset.

The chat owns its fixed viewport and its transcript owns scrolling. Existing ResizeObserver anchoring follows bottom readers and preserves surviving message anchors for older readers. Browser scroll anchoring is disabled on the transcript so it cannot compete with the existing controller. No global overflow hack or per-keystroke forced scroll is added. Smooth jump can be interrupted by wheel/pointer input. The jump button has no read-receipt API; useSeenMessages remains authoritative for existing visibility behavior.

### Socket status

No additional socket connection. Status subscribes to `connect`, `disconnect`, `connect_error`, Manager `reconnect_attempt` and `reconnect_failed`. `socket.connected` and `socket.active` determine transport state. Known `SESSION_EXPIRED` and `JOIN_REQUIRED` handshake errors are labeled separately; room join errors remain in existing room UI. Browser `navigator.onLine` does not establish server connectivity. Every new listener is removed on unmount. No offline synchronization or delivery guarantee is introduced.

### Attachment semantics and limitations

Images remain JPEG/PNG/WebP up to 5 MiB. Files retain existing accepted extensions and 15 MiB limit; server validation remains authoritative. Voice recording still uploads on recording stop, without adding an intermediate recording step.

Ready, Uploading, Upload confirmed and Failed are actual local/request states. Axios byte events produce a percentage only when total bytes are known. An unknown total uses an indeterminate SVG spinner. 100% refers to request transfer, not completed provider processing or delivered message. Upload confirmed means the existing API returned success and the existing socket emission was invoked; it is not a server acknowledgment of message delivery.

The API has no idempotency key or confirmed cancellation operation. Therefore no cancellation or automatic retry is advertised. Uncertain failures explain why retry is disabled. Users may remove a failed selection; no request is silently replayed by this preview. Existing authentication interceptors are retained. Access/room/transport is checked again before the uploaded-media message is emitted. Failed or stale uploads remain subject to the existing server lifecycle; this frontend does not claim provider deletion.

Object URLs are revoked on replacement/removal/unmount. Confirmed previews clear after 1.5 seconds. Room/access changes clear selected attachments and sheets. Removing an uploading selection is disabled because cancellation is unsupported. No backend media or ImageKit behavior changed.

## Responsive and accessibility decisions

Existing theme tokens, fonts, branding and SVG reaction controls remain. No authored UI emoji added. Reduced motion disables gesture return/route/loading animations. Native dialogs preserve focus trapping, Escape and invoking-control restoration; sheets retain labeled headings and explicit close handles. Touch controls use 44px targets. Bottom navigation uses a navigation landmark and React Router `aria-current`.

The existing sidebar remains at desktop widths; bottom navigation appears below 1024px only inside AccountLayout. It never renders in guest or registered chat routes. Session controls become a mobile sheet below 640px; destructive confirmation flows remain unchanged. All existing controls remain accessible in compact composer layouts.

This is an accessibility improvement, not a complete WCAG conformance certification. Native browser dialog behavior was tested in Chromium; real VoiceOver/TalkBack remains manual.

## Test execution and evidence

Frontend baseline: 93 tests. Final full suite: **113 passed, 0 failed, 0 skipped across 27 files**.

Commands run using actual client scripts:

```sh
npm --prefix client test
npm --prefix client run typecheck
npm --prefix client run lint
npm --prefix client run build
```

Typecheck, lint and production build passed. No dependency added. Lazy page chunks retained; final chat chunk approximately 28.2 kB gzip, main chunk 125.2 kB gzip. No Framer Motion import was needed for these short interactions.

New regression coverage: reply threshold/vertical/cancel/control/edge/modal/permission checks; visible date updates/deletion/empty; jump distance/unread and interrupted smooth scrolling; attachment validation/size/preview/revoke/failure/progress/no unsafe retry; bottom route selection and keyboard hiding; sheet Escape/focus/handle drag; pull threshold/single-flight/failure/top/modal/edge checks; skeleton single announcement; route heading focus; socket status and listener cleanup; visual viewport keyboard reduction/blur.

### Browser isolation and coverage

Used the existing `npm run voice:manual` harness at `127.0.0.1:5178`. Its launcher strips provider/database environment variables and uses the repository's in-memory database adapter with ImageKit disabled. **No automated browser test contacted production databases.** No harness/backend files were modified.

- Two separate browser contexts exchanged messages through the actual local Express/Socket.IO handlers, including messages arriving while the first context read older content. Unread increased to one and older content was retained. Smooth jump reached within one pixel of the bottom after settling. An initial sample at 500ms was too early for the browser animation; the settled check passed.
- Chromium CDP touch input activated swipe Reply, opening the existing reply composer.
- Message actions opened as a native mobile dialog; Reply/attachment preview/removal/Cancel reply worked. Session sheets closed with Escape, and the lower Terminate control was reachable by scrolling without invoking destruction.
- Actual isolated backend upload returned its intentional 503 (provider disabled). Failed preview appeared and offered no unsafe retry. Successful ImageKit upload/delivery is **not newly verified** here.
- Actual existing socket disconnected/reconnected; status changed Offline then Connected.
- Account pages used **explicit browser-response fixtures** for account profile, friends, notifications and directory. These prove frontend navigation/list behavior, not real registered authentication, social persistence or provider integrations. Account fixture page reported no JavaScript page errors. Pull refresh increased directory request count from 2 to 3; keyboard Refresh used the same existing load function.
- Chat checked **26 viewport/theme combinations**: 320×667, 360×740, 375×667, 390×844, 430×932, 640×900, 768×1024, 1024×768, 1280×900, 1440×900, 1920×1080, 390×430, 844×390 in both themes. No horizontal overflow; composer and send geometry remained inside viewport.
- Reply plus file preview also checked at 390×430, 844×390 and 320×667. Composer/send remained visible after final compact spacing refinements. A screenshot exposed the jump button intruding into the header when reply and attachment reduced transcript height; its bottom offset is now clamped to the available transcript height. A final 390×430 browser check confirmed jumpInsideTranscript=true, sendVisible=true and overflow=false.
- Explore fixture checked all 11 requested widths in both themes: **22 additional combinations**, no horizontal overflow. Mobile bottom links, account drawer Escape and notification empty state worked.
- Browser reduced-motion computed route animation was `none`.

Expected harness console messages: guest account probe/refresh 401, development StrictMode connection teardown warning, account fixture socket authorization warning, and intentional upload 503. These were not concealed or reported as provider success. No JavaScript page errors were observed in the account fixture check.

### Screenshot artifacts

Screenshots and CLI scripts are local, ignored artifacts under `output/playwright/mobile-chat/`; no private production content. Representative captures:

- `chat-dark-320x667.png`, `chat-light-320x667.png`
- `chat-dark-390x844.png`, `chat-light-390x844.png`
- `chat-dark-768x1024.png`, `chat-light-768x1024.png`
- `chat-dark-1440x900.png`, `chat-light-1440x900.png`
- `attachment-reply-390x430.png`, `attachment-reply-844x390.png`
- `session-sheet-dark.png`, `session-sheet-light.png`
- `explore-dark-320.png`, `explore-light-320.png`, `explore-dark-1440.png`

Screenshots at small mobile, tablet, desktop and both themes were actually inspected. Capture scripts were corrected to use the application's `light` class and to wait for theme/sheet animation settling.

## Preservation checklist

- [x] Branding/logo/fonts/theme preference preserved; no new emoji UI.
- [x] Existing route destinations, protected layout and guest initialization retained.
- [x] Backend, database migrations/configuration and API/socket contracts unchanged.
- [x] Existing message send/reply/edit/delete/pin/react handlers retained.
- [x] Existing message order/history merge and seen semantics retained.
- [x] Existing timed/Burn/view-once values still flow through media/message handlers.
- [x] Voice recording and WebRTC logic untouched; existing frontend voice tests pass.
- [x] Room creation/join/leave/expiry/destruction handlers retained.
- [x] ImageKit implementation and private access components untouched.
- [x] No fake progress, upload cancellation, read receipt or offline synchronization.
- [x] No production operations, commit, push, merge or deployment.

Preservation here combines unchanged contracts/source boundaries with passing frontend tests and scoped local browser evidence. It does **not** certify every production backend workflow anew.

## Files and architecture additions

New components: `SwipeableMessage`, `TranscriptChrome` (date/jump), `AttachmentPreview`, `MobileBottomNavigation`, `ResponsiveActions`, `PullToRefresh`, `Skeleton`, `PageTransition`. New hook: `useConnectionStatus`. Shared responsive styles: `mobile-experience.css`.

Existing viewport/scroll controllers, Modal/NavigationOverlay/CommandCenter, App/main/AccountLayout and Chat/Account/Temporary/Landing pages were extended. Tests added in `mobile-experience.test.tsx` and `connection-status.test.tsx`, with existing viewport/transcript suites extended.

## Known limitations and physical-device checklist

Physical devices were unavailable. Desktop viewport resizing and Chromium touch emulation do **not** certify mobile virtual keyboard behavior or native back gestures. Before release:

1. On real iPhone Safari/Chrome and Android Chrome, focus composer near latest and while reading older messages; verify no forced jump, hidden send or focus loss.
2. Repeat with reply, edit, selected image/file, voice controls and incoming call. Check portrait/landscape and browser toolbar expansion/collapse.
3. Rotate with keyboard open, pinch zoom and restore scale; check baseline/offset and safe-area handling. Verify dialogs remain above keyboard.
4. Open account Search/Settings fields: bottom nav should hide on substantial keyboard reduction, then return after blur/close.
5. Swipe messages horizontally and scroll transcript vertically; test slow long-press selection, links, media controls, dialog-open races and native edge back. Reply must trigger once.
6. On Android pull supported lists from top; verify one request, scrolling elsewhere, nested areas, failed refresh and keyboard button. On iOS confirm native refresh/back is preserved.
7. With a development provider integration, verify actual upload progress/confirmed completion, expiration/private download, uncertain network failure and recording behavior. No production automated fixture account/database writes are authorized by this task.
8. VoiceOver/TalkBack: route heading, sheets/focus restoration, icon names, unread button and single loading announcement. Recheck contrast and reduced motion.
9. With hundreds of messages, test day boundaries, deleted/expired visible messages, reconnect/history updates and upload image layout changes.

Native fallback behavior is intentional. External provider success and physical-device accessibility/keyboard guarantees remain unverified until these checks are performed.
