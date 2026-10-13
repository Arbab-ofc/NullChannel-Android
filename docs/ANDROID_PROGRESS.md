# Android V1 Progress

## 2026-10-13 — M1: Git safety and environment audit

- Starting Git commit: `2b4915339ea9721ea031ad61ee9953ebfa092894`.
- Branch: `feat/android-capacitor` (verified); working tree was clean before this entry.
- Remotes: `origin` is the Android repository; `upstream` is the website repository. No upstream changes or pushes are planned.
- Architecture decision: keep the existing React/Vite client bundled in the APK; keep web cookie authentication intact and add separate mobile credentials and server validation. Production backend rollout remains separate and is not authorized by this task.
- Completed: verified branch, remotes, clean status, starting HEAD, workspace scripts, Node, Java, and Android SDK tooling availability.
- Files modified: `docs/ANDROID_PROGRESS.md`.
- Tests: none; documentation-only Git-safety milestone.
- Environment: Node `v22.18.0`, npm `11.6.2`, Java `18.0.2.1`; Android SDK, `adb`, `sdkmanager`, and `gradle` were not found in the checked locations/PATH. `node_modules` is not installed.
- Known blockers: Android SDK/Android Studio are unavailable in the inspected environment; mobile authentication requires additive server and database migration source, followed by a separately approved production rollout.
- Remaining tasks: Capacitor integration, secure native token storage, mobile auth endpoints and token rotation/replay handling, platform-aware REST/socket auth, Android permissions and lifecycle handling, tests, APK build, and production rollout documentation.
- Latest relevant Git commit: pending M1 commit.
- Next recommended action: add Capacitor and native secure storage scaffolding, then proceed through mobile auth/service changes using additive migrations and focused tests.

## 2026-10-13 — M2: Capacitor Android project

- Objective: package the existing Vite client as local APK assets using Capacitor.
- Completed: added Capacitor `8.5.3` core to the client workspace and CLI/Android platform to the root workspace; configured app ID `com.nullchannel.android`, app name `NullChannel`, bundled `webDir: client/dist`, and HTTPS Android WebView scheme; added Android sync/open scripts; generated the Android project and copied the built client assets.
- Website behavior: no React routing, API, authentication, or website runtime code changed in this milestone. No `server.url` remote loading is configured.
- Android permissions: INTERNET, RECORD_AUDIO, and MODIFY_AUDIO_SETTINGS are declared; microphone is optional at install time. Android backup is disabled to avoid backing up app credential storage without its Keystore key.
- Files modified/added: root `package.json`, `package-lock.json`, `client/package.json`, `capacitor.config.ts`, generated `android/` project (Gradle wrapper/configuration, manifest, activity, resources), and this progress log.
- Validation: `npm run build:client` passed; `npx cap add android` passed; `npx cap doctor` passed; `npx cap sync android` passed; `npm run typecheck` passed; `npm run lint` passed; `npm test` passed (server: 166 passed, 59 skipped; client: 200 passed).
- APK build: not attempted because Android Studio/SDK, `adb`, `sdkmanager`, and `gradle` are unavailable in the environment. `node_modules` is now installed as required for the integration.
- Dependency notice: npm reported 8 audit findings (3 moderate, 5 high) after workspace installation; no automatic audit fixes were applied.
- Known blockers: no APK can be built here until a supported Android Studio/SDK toolchain is available. Mobile auth/API/socket support has not been implemented; production connectivity is not verified.
- Expected/latest milestone commit: `build(android): add bundled Capacitor project` (pending).
- Next recommended action: implement additive mobile session/authentication endpoints and hashed rotating refresh-token storage, then wire secure native storage and platform-aware API/socket credentials.

### M2 completion record

- Commit: `af0cf36` (`build(android): add bundled Capacitor project`), pushed to `origin/feat/android-capacitor`.
- Outcome: React/Vite assets are bundled locally under the generated Capacitor Android project; no remote `server.url` is used.

## 2026-10-13 — M3: Mobile authentication backend source

- Objective: add a separate Android account/session credential flow without changing existing website cookie handlers.
- Completed locally: added mobile guest-session, signup, login, refresh, and logout routes; opaque 256-bit access and refresh tokens are returned only to the client, while only SHA-256 hashes are stored server-side. Access expires in 10 minutes; refresh values rotate and consumed-token reuse revokes the session.
- Database: added additive migration v24 for service-role-only mobile session tables and create/rotate/revoke RPCs. The migration has not been applied to any database.
- Origin protection: added one exact Capacitor origin (`https://localhost`) beside the existing exact website origin; no wildcard or global Origin bypass was added. Existing website account routes and cookie issuance are unchanged.
- Deployment documentation: added `docs/ANDROID_DEPLOYMENT_PLAN.md` with migration ordering, required environment, compatibility/security checks, rollback, and production stop condition.
- Files modified/added: `server/src/app.ts`, `server/src/config/env.ts`, `server/src/middlewares/auth.middleware.ts`, `server/src/middlewares/security.middleware.ts`, `server/src/routes/mobile-auth.routes.ts`, `server/src/services/mobile-auth.service.ts`, `server/src/tests/api-socket.integration.test.ts`, `docs/supabase-migration-v24.sql`, `docs/ANDROID_DEPLOYMENT_PLAN.md`, and this progress log.
- Validation: server typecheck and lint passed; focused integration suite passed (19 tests); full `npm test` passed (server: 168 passed, 59 skipped; client: 200 passed).
- Production: not deployed. Production API, mobile credentials, messaging, and calls are not verified.
- Known blockers: server-side access validation is not yet wired into all REST and Socket.IO paths; Android client secure credential storage and token refresh integration remain; SQL rotation/replay behavior has not been run against PostgreSQL; Android SDK and Gradle build remain unavailable.
- Expected/latest milestone commit: `feat(android): add rotating mobile authentication` (pending).
- Next recommended action: add Android Keystore secure storage and wire platform-aware mobile credentials through REST and Socket.IO, then exercise the server migration in an isolated PostgreSQL database.

## 2026-10-13 — M4/M5: Secure mobile client authentication and Android lifecycle

- Objective: connect the bundled app to the new mobile session flow and preserve website cookie authentication.
- Completed locally: implemented an Android Keystore AES-256-GCM secure credential plugin, mobile login/signup/session restoration, refresh serialization and token rotation, logout revocation, native-only bearer headers for REST and Socket.IO auth handshakes, expired-session retry, HTTPS production API default, Android invite-link host handling, and app pause/resume/back-button behavior. Native calls end when the app is paused; no foreground service or background-call claim is made.
- Website: web requests and Socket.IO continue on their existing cookie paths; no global SameSite change or wildcard Origin allowance was introduced.
- Files modified/added: `android/app/src/main/java/com/nullchannel/android/{MainActivity,SecureCredentialStorePlugin}.java`; `client/src/lib/{mobile-auth,constants,api,account,session,account-socket,socket}.ts`; `client/src/main.tsx`; `client/src/hooks/{useAccount,useSocket,useVoiceCall}.ts*`; `client/src/pages/{AuthPage,AccountPages,ChatPage}.tsx`; `client/src/components/{chat/GroupTools,chat/ViewOnceMedia,common/EndpointReference}.tsx`; `server/src/{middlewares/account.middleware.ts,middlewares/auth.middleware.ts,services/mobile-auth.service.ts,services/presence.service.ts,sockets/auth.ts,sockets/index.ts,tests/api-socket.integration.test.ts}`; `client/src/tests/mobile-auth.test.ts`; `client/src/tests/api.test.ts`; `client/src/tests/account-session-ui.test.tsx`; workspace lock/package files; and this progress log.
- Validation: `npm run typecheck` passed; `npm run lint` passed; `npm test` passed (server: 169 passed, 59 skipped; client: 203 passed); `npm run build:client` passed; `npx cap sync android` passed. `git diff --check` passed after the final Java persistence-result check.
- Android build: `./gradlew assembleDebug` was attempted; Gradle 8.14.3 downloaded and configured the project, then stopped because no Android SDK location is available (`ANDROID_HOME`/`sdk.dir`). No APK was produced and no device tests have been performed.
- Production: no migration was applied, no backend was deployed, and no production authentication/API/socket/call verification was performed. The migration's rotation/replay behavior still needs execution in an isolated PostgreSQL environment.
- Known blockers: Android SDK/Android Studio remain unavailable in the environment; APK build and native Java compilation are unverified; mobile backend requires migration and separately authorized rollout; Android account, guest, messaging, attachments, Socket.IO and audio-call behavior need staging/device verification.
- Latest relevant Git commit: `791fa09` (`feat(android): add rotating mobile authentication`); this milestone is ready for focused review; the Android SDK blocker prevents an APK build.
- Next recommended action: complete build attempt, review/stage only this milestone, commit and push to `origin/feat/android-capacitor`; install Android Studio/SDK and validate on a staging device before any production rollout.

### M4/M5 completion record

- Commit: `02caddb` (`feat(android): wire secure mobile sessions`), pushed to `origin/feat/android-capacitor`.
- Outcome: native Keystore-backed credential storage and mobile auth wiring are implemented in the repository. Android back/resume/pause hooks are in place, including ending audio calls on pause. Website auth remains on its prior cookie path.
- Validation: final `npm run typecheck`, `npm run lint`, client focused tests (19 passed), full test suite (server 169 passed/59 skipped; client 203 passed), client production build, and Capacitor sync all passed. `git diff --check` passed.
- APK status: `./gradlew assembleDebug` failed because the Android SDK is not installed/configured. No APK was produced.
- GitHub status: commit pushed successfully to the Android repository branch. No upstream website changes were made.
- Next recommended action: install/configure Android Studio and Android SDK, rebuild and install a debug APK, then validate auth, REST, Socket.IO, attachments, and audio calling against a staging backend after applying the reviewed migration in an isolated database.

## 2026-10-13 — M10: Production diagnosis, socket lifetime, and Android insets

- Starting commit for this audit: `19e9406` on `feat/android-capacitor`; working tree was clean. `origin` is the Android repository; no upstream or production changes were made.
- Verified production root cause with empty, credential-free requests: health returned `200`; mobile login with website Origin returned `401 SESSION_EXPIRED`, showing the request fell through to anonymous-session middleware; the same invalid request with `Origin: https://localhost` returned `403 CSRF_REJECTED`, showing the Android origin is not accepted by current production configuration/code. The local Android app cannot authenticate or create its mobile guest session until both server route support and exact app-origin configuration are deployed.
- Completed locally: scoped mobile auth routes to the exact Capacitor origin; added fallback UI explaining when the mobile session endpoint is missing; guest REST requests now attempt to create a fresh guest session after a confirmed expired/revoked session; refresh/logout operations serialize so an in-flight refresh cannot persist a rotated credential after logout.
- Socket lifetime: added two-minute-before-expiry refresh for account and guest credentials at startup, every minute, and before resume events. Rotation updates the existing session row, preserving the 10-minute access-token limit and allowing the 15-second server revalidator to keep active main/account/isolated-room sockets authorized. Socket-expired recovery force-refreshes credentials; reconnect backoff is bounded and continues retrying transient failures, while `JOIN_REQUIRED` is not retried. Existing call authorization and signaling paths are unchanged.
- Android UI: `MainActivity` now applies status/navigation/cutout/IME insets to the WebView content view for target SDK 36; activity uses `adjustResize`. This addresses status-bar overlap and keeps content above navigation bars and the keyboard.
- Migration audit: verified RPC names/argument names against the service, row locks, replay revocation, expiry revocation, RLS, service-role-only grants, and restricted `SECURITY DEFINER` search paths. Added service and migration invariant tests. No production migration was executed. A real PostgreSQL migration run remains outstanding: Docker is unavailable, and the accepting local PostgreSQL listener was left untouched because its data ownership was unknown.
- Files modified/added: `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/com/nullchannel/android/MainActivity.java`; `client/src/components/rooms/ActiveRoomsSection.tsx`, `client/src/lib/{account-socket,account,api,mobile-auth,socket}.ts`, `client/src/main.tsx`, `client/src/pages/LandingPage.tsx`, `client/src/tests/mobile-auth.test.ts`; `server/src/routes/mobile-auth.routes.ts`, `server/src/tests/api-socket.integration.test.ts`, new `server/src/tests/mobile-auth.service.test.ts`, new `server/src/tests/mobile-auth-migration.test.ts`; `docs/ANDROID_DEPLOYMENT_PLAN.md`; and this progress record.
- Validation: `npm run typecheck` passed; `npm run lint` passed; full tests passed (server 179 passed/59 skipped; client 208 passed); client production build passed; Capacitor sync passed; Java 21 Android `assembleDebug` passed. APK signature verification passed. There is no Android device attached to `adb` in this environment, so no install or physical-device behavior is claimed.
- APK: `android/app/build/outputs/apk/debug/app-debug.apk`, package ID `com.nullchannel.android`, 4.4 MB, debug-signed. Build is successful, but production authentication/API/socket/call behavior is not enabled until backend deployment.
- Known blockers: production mobile route/origin rollout; isolated PostgreSQL migration execution; attached Android device for safe-area, keyboard, secure-storage, session refresh, network recovery, and voice-call testing. The production website login/chat/call flows were not exercised with a production user; website cookie behavior remains covered by the local regression suite.
- Latest relevant Git commit: `19e9406` before this audit change set; this M10 work is pending focused diff review, commit, and push.
- Next recommended action: review the final diff and secret scan, commit and push to `origin/feat/android-capacitor`, then follow `docs/ANDROID_DEPLOYMENT_PLAN.md` for a separately authorized backend rollout and staging/device verification.

### M10 final validation record

- Final `npm test` passed: server 25 files passed/8 skipped (182 passed/59 skipped); client 40 files passed (209 passed).
- Final `npm run typecheck` and `npm run lint` passed. The client production build and Capacitor sync passed; Java 21 `./gradlew assembleDebug` passed after the final bundle sync.
- APK verified at `android/app/build/outputs/apk/debug/app-debug.apk` (package `com.nullchannel.android`, 4.4 MB, debug signing verified). `adb devices -l` showed no attached device, so no installation or physical-device test is claimed.
- One earlier test invocation overlapped the type/lint/build jobs and the server manual-harness subprocess exited 143. The server suite passed in isolation and the subsequent final combined `npm test` passed.
- New automated coverage includes Capacitor-origin gating, expired-session guest recreation diagnosis, concurrent refresh coalescing, refresh/logout serialization, proactive refresh before socket expiry, mobile RPC contract/security invariants, and mobile Socket.IO stable-session revalidation.
- SQL was statically audited and covered by migration invariant tests; no isolated PostgreSQL cluster was created because the available local listener's ownership was unknown and Docker was unavailable. Production SQL was not executed.
- Commit status before final review: `19e9406`; M10 changes are ready for a focused commit and push to `origin/feat/android-capacitor`.

### M10 completion record

- Commit: `2c5b1ed` (`fix(android): recover mobile sessions and handle insets`), pushed successfully to `origin/feat/android-capacitor`.
- Outcome: production incompatibility is reproduced and documented; the app now reports missing mobile backend/origin support, proactively rotates expiring mobile credentials, recovers authorized sockets, and applies Android 15/16 system/IME insets. Website auth code continues through its existing cookie routes.
- Validation: final full suite passed (server 182 passed/59 skipped; client 209 passed); typecheck/lint, Vite build, Capacitor sync, Java 21 Android Gradle build, APK package inspection, and APK signature verification passed.
- APK path: `android/app/build/outputs/apk/debug/app-debug.apk`. No device was attached to adb, and the production backend/migration remain undeployed.
- Next action: follow the manual backend rollout in `docs/ANDROID_DEPLOYMENT_PLAN.md`, then validate the APK on an attached Android device against staging before any production release.

## 2026-10-13 — Pre-deployment compatibility fixes

- Starting commit: `072542359f2d66ad314cf27ae95d7b7646d01c21` on `feat/android-capacitor`; working tree was clean. Verified `origin` points to the Android repository. The website repository was not modified.
- Completed: Socket.IO now allows credentialed polling CORS only for the exact configured website and Android origins. `MOBILE_APP_ORIGIN` remains a development/test default but is mandatory in production; missing configuration fails environment validation at startup.
- Regression coverage: verified website account-cookie authentication and anonymous cookie issuance, HttpOnly/SameSite=Strict flags, website-origin CORS and Socket.IO handshake; verified Android account-bearer authentication and guest bearer REST/socket access; verified both allowed origins and rejection of unconfigured origins for API and Socket.IO CORS.
- PostgreSQL: applied the v24 SQL only to a newly created disposable loopback database with a minimal `auth.users` fixture, then ran the SQL integration test for session creation, refresh rotation, replay detection/revocation, explicit logout revocation, and service-role RPC/table grants. The local test database was dropped after verification. No production Supabase access or migration occurred.
- Files modified: `server/src/config/env.ts`, `server/src/sockets/index.ts`, `server/src/tests/api-socket.integration.test.ts`, new `server/src/tests/account-middleware.integration.test.ts`, new `server/src/tests/env.test.ts`, new `server/src/tests/mobile-auth.database.integration.test.ts`, new `server/src/tests/sql/mobile-auth-v24.sql`, and this progress record.
- Validation: `npm run typecheck` passed; `npm run lint` passed; full test run passed (server 194 passed/60 skipped; client 209 passed); isolated PostgreSQL v24 integration test passed; `git diff --check` passed. The database exercise used the actual migration file and local PostgreSQL, not a full Supabase installation.
- Production and staging: nothing deployed. Production mobile auth, existing website behavior on production, migration rollout, Android messaging, and audio calling remain unverified. Backend source is ready for staging deployment after review; do not distribute the Android app as production-connected until staging checks and the separate production prerequisites are complete.
- Expected/latest milestone commit: pending final diff/secret review and commit.
- Next recommended action: commit and push only this verified Android branch milestone, then apply v24 and deploy the backend in staging for end-to-end validation.

### Pre-deployment compatibility fixes completion record

- Implementation commit: `ee7c8cb` (`fix(android): secure mobile origin compatibility`). The code, tests, isolated PostgreSQL fixture, and progress entry are committed on `feat/android-capacitor`.
- Final validation: workspace typecheck and lint passed; backend suite passed (194 passed/60 skipped); client suite passed (209 passed); isolated PostgreSQL migration/RPC integration test passed; staged diff check passed.
- Push destination: verified `origin` is `https://github.com/Arbab-ofc/NullChannel-Android.git`; push to `origin/feat/android-capacitor` is pending.
- Next action: push the two Android-only commits, then run the documented v24 and backend rollout in staging before any production release.
