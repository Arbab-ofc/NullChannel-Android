# Android Backend Production Rollout Plan

This plan is documentation only. No production VPS, environment, service, or database changes have been made. The Android app must remain marked as not production-connected until every backend item below is deployed and verified.

## Required backend changes

- Deploy the Android repository's reviewed server changes for `/api/mobile/session`, `/api/mobile/auth/signup`, `/api/mobile/auth/login`, `/api/mobile/auth/refresh`, and `/api/mobile/auth/logout`.
- Deploy mobile access-token validation for REST and Socket.IO, using opaque random bearer values whose SHA-256 hashes are stored server-side. Access credentials expire after 10 minutes. Refresh values rotate on every refresh; reuse of any consumed refresh value revokes that session family.
- Keep the existing website login/signup/refresh/logout endpoints and HttpOnly `Secure; SameSite=Strict` cookies unchanged.
- Permit only the exact production website origin and the Capacitor Android origin `https://localhost`. Continue rejecting all other browser origins. Require the appropriate mobile bearer credential for mobile protected resources and preserve all current authorization and rate limits.
- Configure `MOBILE_APP_ORIGIN=https://localhost` in the protected server environment. This is an exact origin, not a wildcard.

## Database migration

- Review and apply `docs/supabase-migration-v24.sql` before deploying code that calls the new mobile session RPCs.
- The additive migration creates `mobile_auth_sessions` and `mobile_auth_refresh_tokens`, enables RLS, denies browser roles, grants access only to `service_role`, and adds narrowly scoped session create/rotate/revoke RPCs.
- Do not apply the migration from this repository or from the Android build pipeline. Use the production database owner's reviewed migration procedure and backup policy.
- No existing user, profile, friendship, message, room, or website session data is rewritten by this migration.

## Compatibility and security verification

1. Verify the migration in an isolated database with representative existing schema and confirm rerunning the migration is not used to rewrite its recorded history.
2. Confirm the existing website login, signup, refresh, logout, CSRF rejection, and HttpOnly cookie attributes remain unchanged.
3. Confirm mobile signup/login rate limits and email-verification behavior; ensure errors and logs never include passwords, access values, or refresh values.
4. Confirm the app origin receives credentialed CORS headers only when exactly configured; reject lookalike, HTTP, wildcard, and arbitrary origins.
5. Verify access expiry, refresh rotation, concurrent refresh behavior, replay revocation (including older consumed refresh values), revoked-session rejection, expiry, and logout.
6. Verify REST and Socket.IO identify users from validated mobile credentials, never from client-supplied account or sender IDs. Verify existing room membership, friend, presence, and call authorization still applies.
7. Confirm no bearer token is accepted from a URL/query string and no production secret is present in the APK.
8. Verify HTTPS certificates, API/socket connections, and normal website traffic. Do not infer successful production connectivity from local builds or tests.

## Rollback

- Stop distributing the Android build and revert the server application code to the previous reviewed release; do not alter the website cookie endpoints.
- Keep the additive migration and its data in place during application rollback. Do not drop mobile tables/functions as an automatic rollback because issued-session evidence and migration history must be preserved.
- Revoke affected mobile sessions through the reviewed server-side revocation path. If removal is later required, prepare a separate forward migration after checking active sessions and migration history.
- Restore the prior environment file from its protected backup if the exact mobile-origin setting causes an issue, then restart only through the production owner's approved maintenance process.

## Production validation and stop condition

- Use a staging build signed with a non-production key first. Validate login, session restoration, logout, REST, Socket.IO messaging/presence, file upload, and audio-only calls against the intended backend.
- For production, verify health endpoints and server logs without recording credential material, then run a controlled Android smoke test with an authorized account and verify the existing website remains functional.
- Stop before any production rollout unless the production owner separately authorizes it. This task does not authorize SSH, service restart, environment edits, database application, or backend deployment.
