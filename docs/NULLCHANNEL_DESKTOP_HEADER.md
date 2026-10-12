# NullChannel desktop and tablet header redesign

Branch: `feat/nullchannel-immersive-ui`. Date: 12 October 2026.

**Superseded:** Desktop/tablet navigation now uses the hamburger-driven panel described in [NULLCHANNEL_INFINITE_NAVIGATION.md](NULLCHANNEL_INFINITE_NAVIGATION.md). The sections below retain the previous implementation and verification history.

## Scope and staged-work preservation

Only header markup, shared header presentation/behavior and the offsets needed to keep navigation visible below sticky headers changed. No backend, database, API, authentication logic, Socket.IO, production configuration, theme implementation or mobile bottom-navigation changes. No branch switch, reset, staging, commit, push, merge or deployment.

The existing staged Immersive UI patch was preserved exactly. SHA-256 of `git diff --cached --binary` before and after:

`1189741b82290f08dab75783b00245c57e8eef5ffbe1ccf9d887bef73e55690e`

New header work is unstaged. Files already staged for Immersive UI retain their original index versions, with header changes only in the worktree.

## Earlier implementation (superseded for the landing header)

The floating-pill landing design below was rejected by the user. See the corrective implementation section for the current landing design. The other page headers remain as described.

## Audit and design

The repository uses distinct page headers:

- Landing: original brand/home link, Features/How It Works section anchors, Explore/Docs, theme, Login/Signup, native navigation drawer.
- Account: original brand/home link, notification bell, theme, Logout, native account drawer and existing sidebar destinations.
- Documentation: brand/home link and theme; topic navigation is in the existing sidebar.
- Authentication: brand/home link and theme; form/account links remain in the existing form.
- Chat has its own session header and was not modified by this task.

The new `FloatingHeader` supplies presentation and desktop-only dropdown dismissal. It does not manage authentication, theme state, routes or data. Existing handlers remain the owners of those concerns.

### Desktop, at least 1024px

Centered floating surfaces align with each page's existing content container. Grid alignment balances branding, primary destinations and actions. Rounded corners, one subtle glass blur, restrained border/shadow, existing fonts and violet/cyan tokens refine the surface. Headers remain in normal flow and become sticky with an inset, avoiding layout jumps.

Landing retains all original primary links and actions. Current section anchors use `aria-current="location"`; route destinations use NavLink semantics. The active marker is a short animated underline and tint.

Account header includes Dashboard/Friends/Explore and a native More disclosure containing the remaining existing account destinations. The sidebar retains every existing destination. The More summary highlights when its current destination is inside the disclosure; actual links retain `aria-current="page"`. Pending account deletion still restricts destinations to Settings and hides notifications.

Auth and docs use a quiet two-control floating header. No extra destinations were invented to fill the center.

### Tablet, 768–1023px

Compact padding, logo scale and controls avoid overflow. Landing retains inline Explore/Docs plus the original drawer for Features, How It Works, authentication and room actions. Account retains inline Dashboard/Explore, notifications/theme/logout and the original drawer for all eleven account destinations. The desktop More control is hidden, not substituted for the existing tablet drawer. Auth/docs retain their existing brand/theme controls.

### Mobile, below 768px

No new visual header overrides apply below 768px. Newly added account header links are hidden and do not become flex items. Original layouts, controls, drawer components, breakpoints, theme picker behavior, animations and bottom navigation remain unchanged. Desktop outside-click handling explicitly returns on mobile.

The header wrapper changes the React implementation, but preserves rendered mobile geometry and styles. No verified mobile regression required a mobile CSS change.

## Accessibility and behavior

- Native links and NavLink route states; distinct navigation landmarks for public, primary account and overflow destinations.
- Native details/summary for desktop More, normal Tab navigation, no custom keyboard trap.
- Escape closes disclosures and restores summary focus.
- Desktop/tablet outside pointer and outside focus close header disclosures; selecting a destination closes More.
- Hidden desktop overflow closes when entering tablet widths.
- Original Light/Dark/OLED radio choices and preference persistence remain intact.
- 44px controls, visible token-based focus rings and reduced-motion fallbacks.
- No new emoji, dependency, image or font asset.

Sticky-header checks found existing topic/sidebar offsets insufficient. Related desktop/tablet navigation offsets now leave section/topic headings and sidebar controls below the header. These are scoped to navigation affected by the sticky header; content, room and form behavior were not changed.

## Verification

Commands:

```sh
npm --prefix client test
npm --prefix client run typecheck
npm --prefix client run lint
npm --prefix client run build
```

Results: **148 frontend tests passed, 0 failed, 30 files**. Typecheck, ESLint and production build passed. Nine new navigation tests cover Escape/focus, outside pointer/focus, selection, mobile dismissal exclusion, cleanup/resize, account routes/active states/logout callback, deletion restrictions, theme choices and public section activity. Existing navigation and Immersive UI tests remain passing.

### Browser checks

Playwright CLI used only the existing isolated localhost harness. Production provider/database environment variables are stripped by that harness. Registered profile/notification/list responses were explicitly supplied as browser UI fixtures; this is header/navigation verification, not a fresh real authentication or social audit.

All four header contexts were checked at 1920, 1440, 1280, 1024, 1023, 900, 820, 768, 767, 430, 390, 360 and 320px, in Light, Dark and OLED: **156 combinations**. Final pass: no horizontal overflow, overlapping visible controls, out-of-viewport controls or JavaScript page errors.

- Keyboard Enter opens account More; Tab reaches Requests; Escape closes and restores focus.
- Outside pointer closes More and theme disclosure. An initial click targeted a heading underneath the open popup; the corrected check uses an actual unobstructed outside point rather than forcing a click through the popup.
- Settings navigation works and the More active state updates.
- Public Features anchor updates its active indicator and remains visible below the sticky header.
- Documentation Rooms topic and sidebar now remain below the header: header bottom 86px, sidebar top 112px, topic heading top approximately 140px in the tested desktop viewport.
- Tablet public drawer retains its original links; account drawer contains all eleven destinations. Escape closes both.
- Reduced-motion computed menu animation is `none`.
- Header Signup/Login links reach the actual form screens. Initial URL-only sampling could precede lazy rendering; final checks waited for the auth form and verified its correct headings.
- OLED choice persists after reload; all three choices remain available.

### Mobile before/after evidence

Captured 60 baseline headers before implementation: four pages × three themes × five mobile widths (767, 430, 390, 360, 320px). Final comparison of dimensions, padding, display, gaps, radii, background and visible control geometry/labels matched **all 60**.

An early sample at 100ms caught the existing account-header theme transition still settling after crossing 768px. Rechecking after settling restored identical computed values, without changing mobile animations.

Final screenshot comparison: 50 of 60 are pixel-identical; ten have only 1–22 differing edge pixels with identical measured styles/geometry. These minor capture/rasterization differences are disclosed; pixel-perfect equality for all captures is not claimed. No mobile design changes were introduced.

Representative desktop, tablet and mobile screenshots were actually inspected. Artifacts and verification scripts are local ignored files in `output/playwright/header/`.

## Exact files changed for this task

1. `client/src/pages/LandingPage.tsx`
2. `client/src/pages/DocsPage.tsx`
3. `client/src/pages/AuthPage.tsx`
4. `client/src/components/account/AccountLayout.tsx`
5. `client/src/components/navigation/FloatingHeader.tsx` — new
6. `client/src/styles/desktop-header.css` — new
7. `client/src/tests/desktop-header.test.tsx` — new
8. `docs/NULLCHANNEL_DESKTOP_HEADER.md` — this report

The staged Immersive UI files beyond these existing integration points were not altered.

## Screenshots

- `landing-dark-1440.png`, `landing-light-1024.png`, `landing-oled-820.png`
- `account-light-1024.png`, `account-oled-820.png`, `account-oled-dropdown.png`
- `auth-dark-1440.png`, `docs-light-768.png`
- `before-*` / `after-*` mobile pairs for all 60 mobile cases

All screenshots contain only local or explicit test-fixture data.

## Limitations

Chromium browser automation was available; physical MacBook/iPad testing, Safari/WebKit behavior, device keyboards and screen-reader testing were not performed. The CSS includes a WebKit blur declaration and an opaque-enough fallback surface, but this does not certify Safari rendering. Manually check touch/keyboard disclosures, OLED, reduced motion and sticky navigation in Safari before release.

No real login/logout, SMTP, database or backend feature workflows were repeated. Existing authentication/account handlers and routes remain unchanged; representative navigation and a mocked logout callback were verified. No deployment readiness claim is made.

## Corrective landing-header implementation

The user rejected the compact floating-pill appearance. This correction changes only `client/src/styles/desktop-header.css` and this document. Existing unstaged component integrations and all staged Immersive UI work remain intact.

### Diagnosis and actual rendering path

`main.tsx` mounts App inside BrowserRouter; App lazy-loads LandingPage for `/` and `/features`. LandingPage renders the original Brand, Main navigation, ThemeToggle and account links through FloatingHeader, inside `.landing-container.landing-header-frame`. FloatingHeader imports `desktop-header.css`; `landing.css` supplies the underlying compact mobile layout.

The previous desktop CSS was actually loaded and applied. At 1440px, Chromium measured a 1136×70px header, 22px radius, 12px/18px padding and grid display. The 1200px landing-container cap, inset spacing, 19.2px branding and 12px link text intentionally retained the compact silhouette. This was inadequate art direction rather than stale source or an overridden grid rule.

The inspected preview is `http://localhost:5173/`. Its running Vite process has this repository's `client` directory as cwd; the browser's Vite style metadata points to this repository's desktop-header.css. HMR loaded the correction and the browser confirmed the new CSS marker. The terminal startup banner of the already-running process was not available; the process/listening-port evidence was checked instead. The local preview returned existing API 500s for session/account/room requests because its backend was unavailable. No response was mocked, no backend was changed, and these checks do not certify application workflows.

### Current visual treatment

At 768px and above, the landing header frame becomes an edge-to-edge sticky glass band at top zero. The inner layout is `min(100% - 64px, 1440px)` on desktop, with three regions, an 84px height, 40px original logo, 26.4px branding and 15px navigation. The band has a subtle bottom border, restrained ambient tint and no rounded-pill silhouette. Tablet uses 48px total horizontal inset, 76px inner height, 36px logo and the unchanged existing drawer. OLED uses a true-black base. No new logo, route or behavior was introduced. Shared account/auth/docs headers were not changed by this correction.

### Measured results

All measurements below were observed in Light, Dark and OLED. Header-band height includes its 1px bottom border.

| Viewport | Full band | Inner header | Position / display |
| --- | --- | --- | --- |
| 1440px | 1440×85px | 1376×84px | band x0/y0; inner x32/y0; grid |
| 1024px | 1024×85px | 960×84px | band x0/y0; inner x32/y0; grid |
| 820px | 820×77px | 772×76px | band x0/y0; inner x24/y0; grid |
| 390px | original mobile wrapper | 358×62px | inner x16/y16; flex; radius16px |

The inner desktop/tablet max-width is 1440px and border radius is zero. All twelve width/theme combinations had no horizontal overflow or overlapping visible header controls. Screenshots at the requested four widths were captured; the initial1440 screenshot and corrected1440,1024,820 and390 examples were inspected. The390px geometry, computed background/padding/radius and all control rectangles were identical with and without the correction rules. Mobile markup, breakpoints, bottom navigation, drawer and handlers were untouched.

Focused interactions also checked tablet drawer open/Escape-close, desktop active Features anchor, sticky top-zero position, all retained header destinations and reduced-motion transition removal. Three theme choices were selected using the actual theme controls. The first interaction script sampled drawer closure immediately during its existing exit animation and failed its aggregate assertion; rechecking after the transition settled confirmed drawer closure, active anchor, sticky positioning and reduced-motion values. No application behavior was altered to bypass that check.

### Current validation and artifacts

`npm --prefix client run typecheck`, `npm --prefix client run lint`, `npm --prefix client test` and `npm --prefix client run build` all passed: 148 tests, 30 files, zero failures. This is regression evidence; visual adequacy was assessed separately from real screenshots and dimensions. No new unit test was added for a CSS-only correction; the focused browser scripts exercise the changed responsive presentation.

Screenshots: `output/playwright/header/correction-before-1440.png`, `correction-after-1440.png` and `corrected-{light,dark,oled}-{1440,1024,820,390}.png`. Browser scripts: `correction-check.js` and `correction-interactions.js`, in the same ignored artifact directory.

Limitations: Chromium only, no physical-device or Safari/WebKit verification, and no real backend/authentication workflow retest. User visual acceptance remains their decision. Staged patch SHA-256 remains `1189741b82290f08dab75783b00245c57e8eef5ffbe1ccf9d887bef73e55690e`. No staging, commit, push, merge or deployment.
