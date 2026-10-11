# NullChannel deployment

Repository: https://github.com/Arbab-ofc/NullChannel-v2.0. Development branch: `feat/nullchannel-v2`. This work has not been automatically pushed, merged or deployed. Production remains under operator control.

## Prerequisites and configuration

Use Node 22.12+ and the repository's npm workspaces/package-lock. Build both workspaces with `npm ci` then `npm run build`. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run docs:check` before release.

Server environment is validated in `server/src/config/env.ts`:

| Variable | Requirement/default |
|---|---|
| `SUPABASE_URL` | Existing project's URL. Required. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only existing-project credential. Required. |
| `CLIENT_URL` | Exact browser origin without trailing slash. Required. |
| `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | Required existing provider configuration. Never expose private key. |

| `NODE_ENV` | `production` for Secure cookies; default development. |
| `HOST`, `PORT` | Default `127.0.0.1`, `5050`. Keep backend behind the existing proxy. |
| `BACKGROUND_CLEANUP_ENABLED` | Default `true`; disabling suspends regular cleanup/matching workers. |
| `DATABASE_TIMEOUT_MS`, `IMAGEKIT_TIMEOUT_MS` | Defaults 15000 and 60000. |
| `FRIEND_REQUEST_TTL_DAYS` | Default seven; valid range 1–30. |
| `CLEANUP_SECRET` | Optional manual cleanup endpoint credential; absence disables authorized manual use. |
| `UPLOAD_CONCURRENCY` | Default two. |
| `REST_MUTATION_LIMIT`, `REST_MANAGEMENT_LIMIT` | Default 120 and 20 per minute. |
| `SOCKET_*`, `CALL_*` | Bounded controls described in the validated env schema; retain defaults until measured. |
| `VITE_API_URL` | Client build variable; empty uses same-origin API/socket routing. |
| `NULLCHANNEL_MIGRATION_DSN` | Operator-provided PostgreSQL DSN for the existing Supabase project; migration tool only. |

For this ImageKit account, set `IMAGEKIT_URL_ENDPOINT` to the existing custom endpoint `https://ik.imagekit.io/6kzjhzid5/nullchannel`. The endpoint slug `nullchannel` collides with the Media Library upload folder `/nullchannel`: using the default endpoint routes `/nullchannel/<room>/<file>` through the custom endpoint while dropping the folder from its resource path. Keep the complete provider-returned `filePath` when calling `imagekit.url`; the resulting `/nullchannel/nullchannel/<room>/<file>` contains an endpoint segment followed by a folder segment. A private 32×32 PNG was delivered successfully using this construction on 2026-10-11. The local configuration has been corrected; deployment configuration must use the same endpoint when this work is deployed.

Do not write secrets into tracked files or logs.

## Reviewed forward migrations

The deployed baseline must already have the existing v12-compatible schema. Inspect real SQL catalogs/dependencies first. ``npm run db:inspect` checks required rooms/burn/media-trigger prerequisites and lists pending v13+ migrations without applying them. Current hosted history is at v22. `npm run db:migrate` applies reviewed forward files and records their version and SHA-256 inside each transaction. It refuses changed migration checksums. It does not install/reset the base database or rewrite unrelated records.

The current upgrade sequence is v13 social/account tables, v14 registered rooms/matching, v15 registered messaging/cleanup bridge, v16 polls/moderation/invite tokens, v17 profile avatar lifecycle/social TTL, v18 private media authorization, v19 minimal reports/block effects and v20 timed/view-once media. Apply in order to the existing project; do not create a replacement project. Back up and rehearse migrations on an isolated compatible database before production cutover. Do not reset or truncate shared tables.

API/service-role credentials do not provide arbitrary SQL execution. The CLI initially lacked an authenticated access token. The existing project has migrations v13–v22 applied and checksummed. Scoped hosted social, direct-room, group-poll, public-discovery and account-session workflows passed and their test accounts/rooms were removed. Email recovery, random-match concurrency and private provider media delivery still require verification.

## Runtime and proxy

Start the compiled server with `npm run start --workspace server` and serve `client/dist` through the established proxy. Preserve `/api` routing and `/socket.io` WebSocket upgrade handling, exact-origin HTTPS and SPA fallback to index.html. The backend trusts only loopback proxy connections; the dedicated proxy socket route must overwrite forwarded client-IP headers rather than accept arbitrary values.

Use one Node backend process until presence, call ownership and process-local rate limiting are coordinated across processes. The server starts a minute room/media/social cleanup task and one-second burn/matching tasks, with overlap protection. Supabase durable jobs survive restart; in-memory active calls do not. Monitor sanitized cleanup failures, retries, pending cleanup records and health endpoints. `/health/db` establishes connectivity, not complete migration/provider readiness.

Configure Supabase Auth redirects for the actual origin's `/login` and `/reset-password`. Respect current confirmation behavior rather than silently changing production Auth settings. Verify real signup confirmation and recovery emails in the deployed configuration.

## Release gates and recovery

The private ImageKit delivery failure was traced to the default/custom endpoint slug colliding with the upload folder. Correcting the local endpoint to the existing custom endpoint delivered the private test PNG with HTTP 200 and identical bytes; an unauthenticated application media request returned HTTP 401. Set the production environment to the same proven endpoint when deploying, then verify the application proxy there. Exercise a controlled upload/delivery/delete fixture, including a retry failure, and remove only that fixture. Verify eligible two-browser audio calls with real microphones; no group conferencing or TURN service is provisioned here.

Run guest and registered smoke tests, actual hosted SQL authorization/lifecycle tests, both themes and browser layout checks before deployment. Keep the prior application artifact available. Schema rollback must be a reviewed forward compatibility transition; do not undo applied migrations destructively. Existing legacy public attachment URLs cannot be retroactively revoked or external copies erased.
