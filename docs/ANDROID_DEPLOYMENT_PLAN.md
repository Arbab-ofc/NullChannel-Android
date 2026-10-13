# Android Backend Production Rollout Plan

This plan is documentation only. No production VPS, environment, service, or database changes have been made. The Android app must remain marked as not production-connected until every backend item below is deployed and verified.

## Required backend changes

- Deploy the Android repository's reviewed server changes for `/api/mobile/session`, `/api/mobile/auth/signup`, `/api/mobile/auth/login`, `/api/mobile/auth/refresh`, and `/api/mobile/auth/logout`.
- Deploy mobile access-token validation for REST and Socket.IO, using opaque random bearer values whose SHA-256 hashes are stored server-side. Access credentials expire after 10 minutes. Refresh values rotate on every refresh; reuse of any consumed refresh value revokes that session family.
- Keep the existing website login/signup/refresh/logout endpoints and HttpOnly `Secure; SameSite=Strict` cookies unchanged.
- Permit only the exact production website origin and the Capacitor Android origin `https://localhost`. Continue rejecting all other browser origins. Require the appropriate mobile bearer credential for mobile protected resources and preserve all current authorization and rate limits.
- Keep the `/api/mobile/*` endpoints scoped to the exact configured Capacitor origin. The website must continue using its existing cookie endpoints; a website-origin request to a mobile endpoint should receive `MOBILE_ORIGIN_REQUIRED`.
- Configure `MOBILE_APP_ORIGIN=https://localhost` in the protected server environment. This is an exact origin, not a wildcard.

## Database migration

- Check the production migration ledger/catalog first. Apply v24 only if its tables/RPCs are absent; do not rerun it when already installed.
- Apply `docs/supabase-migration-v25.sql` after v24 and before deploying this guest-auth fix. It links mobile guest sessions to `anonymous_sessions`, the existing database authorization source required by `create_room`/`join_room`, and backfills existing v24 guest sessions.
- v25 aborts on a mobile guest UUID already owned by an unrelated anonymous session. Treat `MOBILE_GUEST_IDENTITY_COLLISION` as a stop-and-investigate condition; do not bypass the guard or overwrite the website session.
- Before the migration, verify a recent restorable Supabase backup/snapshot exists, record the current migration version, and follow the production database owner's backup and restore procedure. The migration is additive, but the backup is still a rollout prerequisite.
- v24 creates `mobile_auth_sessions` and `mobile_auth_refresh_tokens`, enables RLS, denies browser roles, grants access only to `service_role`, and adds narrowly scoped session create/rotate/revoke RPCs. v25 adds a nullable, cascading mobile-session link to `anonymous_sessions`; it does not alter website cookie hashes or cookie authentication.
- Do not apply the migration from this repository or from the Android build pipeline. Use the production database owner's reviewed migration procedure and backup policy.
- No existing user, profile, friendship, message, room, or website session data is rewritten by this migration.

## Compatibility and security verification

1. Verify v24/v25 in an isolated database with representative existing schema, including a pre-v25 mobile guest session; confirm the backfill and do not rerun either non-idempotent migration.
2. Confirm the existing website login, signup, refresh, logout, CSRF rejection, and HttpOnly cookie attributes remain unchanged.
3. Confirm mobile signup/login rate limits and email-verification behavior; ensure errors and logs never include passwords, access values, or refresh values.
4. Confirm the app origin receives credentialed CORS headers only when exactly configured; reject lookalike, HTTP, wildcard, and arbitrary origins.
5. Verify access expiry, refresh rotation, concurrent refresh behavior, replay revocation (including older consumed refresh values), revoked-session rejection, expiry, and logout.
6. Verify REST and Socket.IO identify users from validated mobile credentials, never from client-supplied account or sender IDs. Verify existing room membership, friend, presence, and call authorization still applies.
7. Confirm no bearer token is accepted from a URL/query string and no production secret is present in the APK.
8. Verify HTTPS certificates, API/socket connections, and normal website traffic. Do not infer successful production connectivity from local builds or tests.

### Android session endpoint smoke check

- From the bundled Android app origin `https://localhost`, send an invalid empty JSON body to `POST /api/mobile/auth/login`; after deployment it must return `400 VALIDATION_ERROR`, proving the mobile route handled the request before anonymous-session middleware.
- Repeat from the website origin; it must return `403 MOBILE_ORIGIN_REQUIRED`.
- `401 SESSION_EXPIRED` for that invalid mobile login payload means the request fell through to the generic anonymous-session middleware, which is consistent with the current production API not serving the mobile route. Do not treat a health check or website-origin response as proof that Android auth is deployed.
- During this audit, a health check returned `200`; `POST /api/mobile/auth/login` with `{}` and the website Origin returned `401 SESSION_EXPIRED`; the same empty request with `Origin: https://localhost` returned `403 CSRF_REJECTED`. This verifies two production blockers: the mobile route is not handling requests, and the production Origin allowlist does not currently permit the Capacitor origin. The requests contained no account credentials and made no account, database, environment, or deployment changes. Configure the exact mobile origin and deploy the reviewed Android server source only through the separately authorized rollout, then repeat both checks.

## Rollback

- Stop distributing the Android build and revert the server application code to the previous reviewed release; do not alter the website cookie endpoints.
- Keep the additive migration and its data in place during application rollback. Do not drop mobile tables/functions as an automatic rollback because issued-session evidence and migration history must be preserved.
- Revoke affected mobile sessions through the reviewed server-side revocation path. If removal is later required, prepare a separate forward migration after checking active sessions and migration history.
- Restore the prior environment file from its protected backup if the exact mobile-origin setting causes an issue, then restart only through the production owner's approved maintenance process.

## Production validation and stop condition

1. Confirm a restorable database backup and the reviewed migration file/hash.
2. Apply only missing migration versions, in order, through the database owner's approved process; for an existing v24 deployment, apply v25 once.
3. Configure `MOBILE_APP_ORIGIN=https://localhost` in the protected server environment and deploy the reviewed Android repository backend build through the production owner's release process.
4. Verify the server starts and the website's existing cookie auth still works before testing the Android app.
5. Run the Android-origin and website-origin mobile-login checks below, then validate mobile login/logout, guest session restoration, rooms, messaging, presence, file access, and audio-only calling on staging.
6. Perform the production smoke checks only after separate production rollout approval; do not enable DNS, database, or server changes as part of this repository task.

- Use a staging build signed with a non-production key first. Validate login, session restoration, logout, REST, Socket.IO messaging/presence, file upload, and audio-only calls against the intended backend.
- For production, verify health endpoints and server logs without recording credential material, then run a controlled Android smoke test with an authorized account and verify the existing website remains functional.
- Stop before any production rollout unless the production owner separately authorizes it. This task does not authorize SSH, service restart, environment edits, database application, or backend deployment.
