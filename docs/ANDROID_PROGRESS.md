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
