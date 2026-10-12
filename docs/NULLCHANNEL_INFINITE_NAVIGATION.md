# NullChannel — Infinite Motion Navigation

Branch: `feat/nullchannel-immersive-ui`. Local frontend implementation, 12 October 2026.

## Scope and integration

`main.tsx` mounts App/React Router. App routes the public landing screens to LandingPage, documentation to DocsPage, authentication to AuthPage, and registered areas through AccountLayout. Those four contexts already use FloatingHeader. Chat's room/session header is separate and unchanged.

FloatingHeader now renders only its existing first child (brand/home link) and ExperimentalMenuButton at widths >=768px. At smaller widths it renders the original children, unchanged. Existing mobile drawers and mobile bottom navigation are untouched. Resize closes the experimental panel before entering mobile presentation.

Desktop headers have an 84px inner height; tablet headers have a 76px inner height. The landing background continues edge-to-edge and retains its existing 1px border. Account/auth/docs headers have full-width backgrounds with content insets. Theme values and persistence remain owned by the existing ThemeProvider.

## Existing destinations and actions

- Landing: Features, How it works, Explore, Docs, Log in, Get started, appearance and the existing Create Private/Create Group handlers.
- Account: all eleven existing accountLinks, active-route state, existing NotificationBell, appearance and original logout/error handling. Deletion-pending profiles retain Settings-only navigation and no notification control.
- Docs: the actual twenty-four topic anchors, respecting the existing search filter, and appearance. Search/content/download remain in the existing documentation layout.
- Auth: the existing header's appearance control moves into the panel. Existing form links remain in their forms. No new routes or authentication behavior were introduced.

Only account UI browser fixtures were mocked for presentation checks, not production code. No real authentication, logout, room creation request or backend workflow was rerun.

## Hamburger and panel

ExperimentalMenuButton is a real 56×52px button with aria-expanded/controls, a changing accessible name and a focus ring.26/17/22px asymmetric strokes shift on hover and morph into an X. Native dialog top-layer semantics provide modal isolation; the integrated panel uses the same artistic button for closure.

The 480px panel slides from the right over 520ms with a restrained opacity transition. Width is bounded by the viewport. Escape, backdrop and the panel hamburger close it. Closing retains the dialog until the transition completes, then returns focus to the opener. Body overflow is restored on closure/unmount. The existing room-creation dialog receives a clean scroll-lock handoff before its handler runs.

A manual Tab/Shift+Tab wrap supplements native dialog isolation, excluding inert and non-rendered controls. Keyboard navigation switches the transcript to the canonical ordinary list; keyed canonical content preserves the focused node when clones disappear. Reduced motion removes transitions and decorative repetition. Menus with fewer than three actual links also use ordinary scrolling.

## User-controlled infinite scrolling

The menu uses five finite visual sequences: two before, one canonical, two after. Only the canonical middle sequence contains links. Actions/appearance are in a stationary footer and are never cloned. The visual copies contain spans/SVGs, are inert and aria-hidden, have no IDs or interactive elements, and do not participate in Tab navigation or screen-reader navigation.

ResizeObserver measures the canonical sequence's height H. Initial scrollTop is 2H. A passive scroll listener coalesces normalization into requestAnimationFrame; outside the[2H,3H) range it maps the scroll offset modulo H back into that range. No new DOM is appended and no React state changes per scroll. Observers, frames and listeners are cleaned up.

Navigation copies retain typography, icons, numbering and active tint. A stationary click/tap on an inert visual repeat is resolved by scroll-surface coordinates to its sole canonical control; that original control's click handler runs. Pointer movement beyond 8px is treated as scrolling and does not activate a destination. Keyboard focus always uses the ordinary canonical list. There is no auto-scroll or invented navigation action.

## Files changed by this task

1. `client/src/components/navigation/FloatingHeader.tsx`
2. `client/src/components/navigation/ExperimentalMenuButton.tsx` — new
3. `client/src/components/navigation/InfiniteNavigationPanel.tsx` — new
4. `client/src/styles/infinite-navigation.css` — new
5. `client/src/pages/LandingPage.tsx`
6. `client/src/pages/DocsPage.tsx`
7. `client/src/components/account/AccountLayout.tsx`
8. `client/src/tests/desktop-header.test.tsx`
9. `client/src/tests/account-navigation-ui.test.tsx`
10. `docs/NULLCHANNEL_INFINITE_NAVIGATION.md` — this report
11. `docs/NULLCHANNEL_DESKTOP_HEADER.md` — supersession notice

No backend, schema, API contract, Socket.IO, theme infrastructure, dependency or production configuration changed. AuthPage requires no direct edit because it already uses FloatingHeader. Earlier staged/unstaged work was retained.

## Browser evidence

Chromium inspected the actual local Vite application at `http://localhost:5173`, serving this repository. Public rendering uses its actual local frontend; existing API500s were recorded because the local backend was unavailable. Account checks explicitly supplied browser-only profile, unread-count and social-list fixtures; they are UI verification, not proof of live account functionality.

Focused checks:

- All requested thirteen widths:1920,1440,1280,1024,1023,900,820,768,767,430,390,360,320. At>=768, the landing header contains exactly one brand link and one button, with no inline navigation/theme/auth controls. No document horizontal overflow was found.
- Open/button close, Escape, backdrop, delayed focus restoration and body scroll restoration passed.
- Loop H568px: starting1136px, downward wrap returned1176px, upward wrap returned1664px. Wheel scrolling changed offset; copies remained bounded and contained zero controls.
- Clicking a visual repeat activated the real Features anchor. No duplicate navigation API was introduced.
- Tab focused Features, removed decorative copies and retained focus; Shift+Tab returned to Close navigation and wrapped to Create Group within the modal.
- Emulated Chromium tablet touch moved scrollTop from1136 to1241px with decorative copies retained. This is not physical-device certification.
- Light/Dark/OLED were selected using original theme controls. Reduced motion produced zero decorative copies and a 0s transition.
- Account UI fixture retained all eleven destinations, Friends active state, notifications and Logout. Deletion restrictions are additionally covered by focused unit tests.
- Docs panel had its actual twenty-four topic links; auth panel retained all three appearance choices and no artificial repeating menu.
- Create Private opened its existing form modal without submitting. Navigation closed, body stayed locked while the form was open, and returning from the form restored body overflow.
- Mobile retains original hamburger/theme/header controls. The390px landing header remains358×62px at x16/y16, matching the prior correction's measured mobile layout. The other four requested mobile widths retain original controls and no experimental menu. No exhaustive new pixel comparison was performed.

Screenshots captured and inspected in ignored `output/playwright/header/`:

- `infinite-desktop-closed.png`
- `infinite-desktop-open.png`
- `infinite-desktop-dark-open.png`
- `infinite-tablet-open.png`
- `infinite-mobile-unchanged.png`
- `infinite-account-oled.png` (browser UI fixture)

## Regression fixes during verification

- Focus was initially restored before the native dialog closed; corrected to restore after exit completion.
- Removing unkeyed clones could replace the focused canonical node; stable keys now preserve it, with a focused-node regression test.
- Native Chromium Shift+Tab could leave the first dialog control; explicit wrapping now keeps focus in the modal and is browser-tested.
- Fixed-position appearance options could remain painted after details closed; a panel-only closed-details display rule fixes it.
- Modal handoff restores the previous overflow before calling the existing room-form handler, avoiding a captured stale scroll lock.
- The old account navigation test assumed the tablet drawer. It now uses the preserved390px mobile context, verifies Escape focus restoration, and verifies closure when entering desktop navigation.

## Validation and limitations

Commands: `npm --prefix client run typecheck`, `npm --prefix client run lint`, `npm --prefix client test`, `npm --prefix client run build`. All passed: **153 frontend tests, 30 files, zero failures**; TypeScript, ESLint and production build passed. Focused modal/keyboard regression tests are included in that count.

Physical MacBook/iPad, hardware trackpad, Safari/WebKit, screen readers and unusual assistive technologies were not tested. Very fast inertial scrolling/resize on physical devices needs manual review; finite/reduced-motion navigation remains the fallback. Chrome touch emulation and synthetic wheel input are explicitly distinguished from hardware testing. The loop is a visual navigation treatment, not an anonymity/security feature.

No deployment readiness or real authentication claim is made. Existing staged patch remains byte-identical: SHA-256 `1189741b82290f08dab75783b00245c57e8eef5ffbe1ccf9d887bef73e55690e`. No staging, branch switch, reset, commit, push, merge or deployment.
