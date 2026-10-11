# NullChannel deployment readiness

Review date: 2026-10-12 (Asia/Kolkata). Repository: `Arbab-ofc/NullChannel-v2.0`. Branch checked: `feat/nullchannel-v2`.

## Decision: CONDITIONAL GO

The candidate is buildable and the previous feature verification reports 32 PASS, 0 FAIL, 1 BLOCKED and 4 UNVERIFIED, with 301 automated tests passing. That audit was not repeated. **Replacement of the deployed version is not yet cleared:** production configuration, worker execution and rollback compatibility must be established before cutover. No new code failure was identified by this focused review.

This is a conditional release recommendation, not proof that the currently running VPS has the candidate configuration or artifact. No authenticated VPS or Supabase Management access was available in this review. No production configuration, migrations, application records, SMTP or DKIM settings were changed. No commit, push, merge or deployment occurred. Existing uncommitted work was preserved; this review added this report only to source files. Builds regenerated ignored build artifacts.

## Evidence collected in this review

| Check | Result and limit |
| --- | --- |
| Repository and branch | Origin matches the required repository; active branch is `feat/nullchannel-v2`. Existing modified/untracked upgrade files remain. |
| Supabase migration history | `npm run db:inspect` succeeded against the existing configured project. v13–v22 are recorded and their SHA-256 checksums match local SQL; no pending version in this sequence. Base rooms, Burn RPC and media-queue trigger prerequisites exist. Only catalog and migration metadata were inspected. No migrations applied. Ledger checks do not exhaustively detect out-of-band schema-definition drift. |
| Production build | Fresh `npm run build` exited 0: backend TypeScript compilation and client TypeScript/Vite production build passed. |
| Compiled production-mode startup | Two separate local starts of `node dist/server.js` returned `/api/health` 200 and exited 0 after SIGTERM, with `server_started`, `shutdown_started`, `shutdown_complete` logs. Process-only cleanup override was false; no database health or user endpoints were called. This verifies basic process restart, not hosted job recovery. |
| Running public service | TLS-validated curl GET `https://nullchannel.teleflow.cyou/api/health` returned 200 and `status: ok`, service `nullchannel-server`. Observed response timestamp `2026-10-11T20:15:34.159Z`, uptime 51,634 seconds. Does not identify the deployed revision or prove database/provider readiness. |
| Public frontend headers | HEAD `/` returned 200, `Cache-Control: no-cache`, frame denial, no-referrer, same-origin CSP with ImageKit media/image allowances and microphone permission. These are observed HTTP headers, not access to the Nginx configuration. |
| Live REST CORS | Health requests with the real origin and an unrelated origin both returned the fixed allow-origin `https://nullchannel.teleflow.cyou`, credentials true, `Vary: Origin`, no-store. Health is intentionally public and returns 200 to either request; the unrelated origin does not get browser CORS permission. This does not test sensitive mutation authorization or live Socket.IO configuration. |
| Local required environment | All six required backend credential/config names are populated locally. Local ImageKit endpoint matches the previously verified custom endpoint. Local CLIENT_URL differs from the production origin, as expected for local development; do not copy the local env file into production. Values were not printed. |

Python's HTTPS probe failed due to its local issuer trust store; curl validated TLS and succeeded. This is not evidence of a production TLS failure. `/api/health/db` was deliberately not invoked: its implementation reads an anonymous session ID, outside this review's prohibition on real-user data access.

Sources: `server/src/config/env.ts`, `server/src/server.ts`, `server/src/app.ts`, `server/src/routes/health.routes.ts`, `server/src/controllers/health.controller.ts`, `server/src/services/cleanup.service.ts`, `server/src/sockets/index.ts`, `scripts/migrate.mjs`, workspace manifests and deployment examples. Prior workflow evidence: [feature verification](NULLCHANNEL_V2_FEATURE_VERIFICATION.md), [Auth verification](NULLCHANNEL_AUTH_VERIFICATION.md), [testing](NULLCHANNEL_TESTING.md).

## Outstanding release gates and exact manual actions

1. **Running production configuration is not inspected.** The operator must inspect the environment actually loaded by the NullChannel service, privately, and record pass/fail against the names and requirements below. Do not paste environment values or use a report containing `systemctl show ... Environment`, `/proc/.../environ`, or an unredacted environment file. Confirm service working directory, executable, user, port, Node version and artifact revision. Local configuration is not production evidence.
2. **Production ImageKit endpoint is not confirmed.** Verify the running service uses the previously verified custom endpoint `https://ik.imagekit.io/6kzjhzid5/nullchannel`, with credentials for the same existing account. If it uses a different endpoint, obtain evidence for that configuration before altering it. The first `/nullchannel` is the endpoint slug; the second in a delivered path can legitimately be the Media Library folder. Do not strip it. Before cutover, use one disposable private image through the candidate's authorized media proxy; record authorized HTTP 200, unauthorized rejection, then fixture destruction and confirmed provider deletion. Earlier local delivery passed; production delivery has not been established by this review.
3. **Production Supabase Auth redirect allowlist is not confirmed.** In the existing project's Authentication → URL Configuration, inspect Site URL and allowed redirects. Expected Site URL is `https://nullchannel.teleflow.cyou`; allow the exact confirmation redirect `https://nullchannel.teleflow.cyou/login` and recovery redirect `https://nullchannel.teleflow.cyou/reset-password`. Confirm the backend's running CLIENT_URL matches this origin. Record evidence of the configuration without secrets. Supabase Management credentials were unavailable, and API success/local email tests cannot prove this allowlist. Do not change SMTP or DKIM. A narrowly scoped production-origin disposable confirmation/recovery smoke check is a cutover prerequisite, not a repeat of the whole Auth audit.
4. **Hosted cleanup execution remains safety-blocked/unverified.** Read the existing service's journal before executing anything: `systemctl status nullchannel --no-pager` and `journalctl -u nullchannel --since '15 minutes ago' --no-pager` (substitute the actual unit name). Look for recurring timestamped `cleanup_complete`, check `cleanup_failed`, `burn_cleanup_failed`, `match_sweep_failed`, `media_cleanup_failed`, and verify the process is not crash-looping. Treat logs as operational data and redact before sharing. No such hosted evidence was available here. A service being active or `/health` returning 200 is insufficient. Before enabling a candidate worker, understand its global scope and establish an approved fixture-scoped observation; never invoke `/api/cleanup` as a harmless health probe. Confirm ordinary scheduled execution and an isolated provider-backed cleanup fixture with operator supervision, without deleting unrelated data.
5. **Rollback and VPS isolation have not been inspected on-host.** Inventory the current NullChannel unit/site/port, neighboring services, release path, capacity and previous artifact. Confirm the rollback artifact works with the already-applied v22 schema and private-media authorization model. Do not assume an old binary is schema-compatible simply because migrations add columns. Keep the previous working artifact and protected configuration available before cutover.

These are gaps in evidence, not verified misconfiguration. They prevent an unconditional GO. No known unapplied migration or SMTP failure is a blocker in this review.

## Four unverified areas and the safety-blocked area

| Area | Production implication | Required disposition |
| --- | --- | --- |
| Message resend idempotency | No client idempotency key or exactly-once guarantee; an application-level resend can create another message. | Accept at-least-once/user-retry semantics explicitly; do not promise exactly-once. If the release requires exactly-once delivery, implement and verify it before release. |
| Physical microphones, external NAT and native mobile keyboard | Synthetic Chromium RTP passed previously; actual hardware/NAT/mobile keyboards did not. Current ICE config accepts STUN URLs only and has no TURN relay support; some networks may fail to establish calls. | Run a short real-device check on Wi-Fi/mobile networks and mobile composers. Do not advertise universal network calling. TURN support would require implementation, not an invented environment switch. Group voice is unsupported. |
| Full WCAG 2.2 AA | Basic focus/labels/layout checks do not establish conformance. | Keep AA claims qualified; schedule screen-reader, keyboard and contrast review. If AA certification is a launch requirement, this remains a gate. |
| Interrupted-upload orphan recovery and broken-image fallback | Normal media delivery/deletion and durable deletion retries passed, but a real interrupted provider write and failed-image UI were not exercised. | Monitor recovery failures; run an isolated interruption/fallback exercise before claiming that path verified. No interrupted upload should be performed against an existing user's file. |
| Global hosted cleanup (BLOCKED) | Expiration access denial and fixture cleanup passed; regular hosted physical cleanup has no execution evidence. | Mandatory operational gate above. Do not resolve it by a blind sweep of shared production data. |

DKIM is intentionally deferred. No DKIM or SMTP changes are prescribed. Any deliverability qualification remains separate from the previously successful email workflows.

## Environment and runtime prerequisites

Only variable names are inventoried here; secrets must stay in a protected service environment file. Local presence does not establish VPS presence.

| Category | Names | Requirements |
| --- | --- | --- |
| Required backend | `CLIENT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | Exact HTTPS public origin with no trailing slash; existing Supabase project and existing ImageKit account; server-only credentials. |
| Production process | `NODE_ENV`, `HOST`, `PORT`, `BACKGROUND_CLEANUP_ENABLED` | Production mode; loopback listener behind the existing proxy; unique reserved port; regular cleanup enabled for the serving release after scope approval. Cleanup defaults to true; audit overrides must not leak into production. |
| Database/provider timeouts | `DATABASE_TIMEOUT_MS`, `IMAGEKIT_TIMEOUT_MS` | Defaults 15s/60s; ensure proxy timeouts are sufficient and resources bounded. |
| Rate limits | `SOCKET_CONNECTION_LIMIT`, `SOCKET_JOIN_LIMIT`, `SOCKET_MESSAGE_LIMIT`, `SOCKET_TYPING_LIMIT`, `REST_MUTATION_LIMIT`, `REST_MANAGEMENT_LIMIT` | Defaults exist. Verify actual settings and trusted proxy IP handling. |
| Upload/social limits | `UPLOAD_CONCURRENCY`, `FRIEND_REQUEST_TTL_DAYS` | Defaults 2 uploads, 7-day requests; align resource budget and documented policy. |
| Voice limits | `CALL_RING_TIMEOUT_MS`, `CALL_CONNECT_TIMEOUT_MS`, `CALL_DISCONNECT_GRACE_MS`, `CALL_INVITE_LIMIT`, `CALL_SIGNAL_LIMIT`, `CALL_MAX_CANDIDATES`, `CALL_MAX_ACTIVE` | Defaults exist; active call state remains process-local. |
| Optional manual worker trigger | `CLEANUP_SECRET` | Unset disables authenticated manual cleanup. Not required for the internal scheduler. Protect if configured; never use in URLs/logs. |
| Frontend build variables | `VITE_API_URL`, `VITE_WEBRTC_STUN_URLS` | Empty API URL uses same-origin REST/socket routing. STUN-only optional list; no TURN credential variable exists. Vite variables are public build inputs, never secrets. |
| Operator SQL tooling only | `NULLCHANNEL_MIGRATION_DSN` or `DATABASE_URL` | Existing-project SQL connection for inspect tooling; not required by the serving application. Do not distribute as a client variable. |

No browser Supabase service-role key or separate project is needed. Environment loading uses the server working directory; a systemd EnvironmentFile must be protected (e.g. owner root, service group, mode 0640). Do not copy local `.env` into an artifact or put secrets in a Vite variable.

The installed locked Supabase SDK requires Node >=22; installed Vite requires Node ^20.19 or >=22.12. The combined reviewed baseline is **Node 22.12+**, locally tested on **22.18.0**. Select an operator-approved supported/patched Node release meeting those requirements and verify the actual service executable. Do not replace the VPS global Node used by other applications. The service example's `/usr/bin/node` is a placeholder to check, not proof of its version.

## Build, serve and health checks

Build a protected, isolated release directory with the repository lockfile:

```sh
npm ci
VITE_API_URL= npm run build
```

Relevant existing checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:check`. They passed in the preceding feature review; only the production build was rerun here. Do not describe the 301 earlier tests as newly executed. Runtime dependencies can be pruned only after build and any required release checks; keep the complete rollback artifact independently.

Serve `client/dist` as static content with SPA fallback for routes including `/login` and `/reset-password`. Start the backend using `npm run start --workspace server`, or directly `node /absolute/release/server/dist/server.js` with `WorkingDirectory` set to that release's server directory. There is no root `npm start` script. Do not use the Vite development/preview server as the production web server.

- `GET /api/health`: liveness only; no database/provider check. Live and local compiled checks passed.
- `GET /api/health/db`: connectivity via a query on `anonymous_sessions`; returns 503 when unavailable. It does not verify all migrations, RLS, Auth, ImageKit or cleanup. Not called in this review to avoid real-user row access; do not make it an automatic destructive remediation trigger.
- `POST /api/cleanup`: secret-protected mutation; **not a health check** and not a complete substitute for all scheduled jobs.

## Proxy, origins and cookies

Express credentialed CORS uses the exact CLIENT_URL; sensitive non-GET/HEAD/OPTIONS API operations enforce a matching Origin. Socket.IO has the same fixed CORS origin and an `allowRequest` exact-origin check, plus authenticated session validation. Source inspection verifies these rules; the deployed socket upgrade configuration was not tested.

Review the NullChannel site only against `deployment/nginx.conf.example`: same-origin `/api/` and `/socket.io/`, HTTP/1.1 upgrade headers, overwrite forwarded client-IP headers, preserve Host and HTTPS scheme, socket timeout sufficient for heartbeats, upload body limit allowing a 15 MiB file plus multipart overhead. Express trusts loopback; socket rate limits only trust a single valid forwarded IP from a loopback peer. With Cloudflare in front, establish the real-IP trust boundary using only trusted proxy ranges; otherwise rate limits may group users under an edge address. Never trust arbitrary forwarded headers.

Production cookies use Secure/HttpOnly and same-site rules; HTTPS and exact browser origin are required. Live REST CORS and homepage headers passed. Actual backend environment, WebSocket upgrade, CDN bypass for authenticated APIs/media and cache settings still need operator inspection. Ensure API/media responses are never cached by CDN rules overriding no-store. HTML should revalidate; hashed assets may be immutable. Inspect effective Nginx headers because `add_header` in a location overrides parent inheritance; the example alone does not prove every response has the intended policies.

## Scheduling, persistence and monitoring

`server/src/server.ts` runs a minute room/media/social cleanup job, 1-second Burn/timed-message cleanup and 1-second matchmaking sweep, with startup cleanup and overlap guards. These are **in-process Node jobs**, not evidence of Supabase hosted cron. They depend on the backend staying alive and cleanup being enabled. The manual cleanup route covers room/media cleanup, not the full social/match/warning/reconciliation sequence.

Supabase stores rooms, expiration deadlines, queue/proposals, media jobs and recovery intents. Media cleanup uses durable claims/leases, exponential retry capped at one hour, and handles provider 404 idempotently. The previous fixture test confirmed failed deletion, persisted retry, new-worker recovery and provider absence. This does not prove the VPS invokes those functions. Calls, socket participation, presence connections and rate-limit memory are local to one process. Server restart ends live calls/connections; reconnection reauthorizes against stored current state, and stale eligibility is swept. Do not promise seamless call continuity or use multiple backend processes/PM2 cluster without shared coordination.

SIGTERM stops jobs/sockets, waits for room/Burn cleanup and closes HTTP; 25-second forced exit bounds shutdown. The example systemd stop timeout is 30 seconds and restart is on failure. The matching sweep is not explicitly awaited during shutdown; a crash/stop can interrupt it, so durable deadline/reservation reconciliation remains important. Local clean starts/stops passed; OS reboot, hosted supervisor restart and full durable-job recovery were not re-executed here.

Structured production logs include timestamps, operations, request IDs, method/status and sanitized errors, with no message bodies or full tokens in the reviewed logger paths. The systemd example sends stdout/stderr to journald. No configured external alert/error-monitoring service was verified. Before cutover, assign an operator and alert on liveness failures, restart loops, sustained 5xx, cleanup failures/retry failures, and loss of expected `cleanup_complete` cadence. A room-cleanup completion log is not individual confirmation that every external deletion succeeded: retries can remain. Review Nginx/CDN access-log policy separately; default full request URLs can retain invitation/query secrets even when application logs do not. Define restricted access, redaction and retention.

## Schema compatibility and safe rollback

No database change is required for this candidate: local v13–v22 checksums match the hosted migration ledger. These migrations add structures but also replace guest/media/room RPCs, triggers and constraints. Guest compatibility passed in the prior audit; this is not a test of every older deployed binary against the current schema. Do not rerun old installation SQL, reset the project, edit recorded migrations or perform a down migration to roll back code.

`deployment/DEPLOYMENT.md` contains legacy v12 installation material, and older deployment text has superseded verification caveats. Use this report and current audit evidence for this existing project; do not follow new-install/base-schema steps against v22. The pending/untracked source changes also mean the candidate must be packaged deliberately with all required files, not fetched as if the remote branch already contains this workspace.

Rollback procedure (operator actions only; not executed):

1. Before cutover, retain a checksummed previous release artifact, its compatible protected configuration and the exact NullChannel service/site definitions. Validate that artifact against the already-applied schema and current private-media access policy. Keep an audited schema-compatible fallback; an insecure older release is not an acceptable fallback.
2. Prefer versioned immutable release directories plus a single current-release pointer. Keep one serving backend/worker. Prepare atomic paired frontend/backend rollback; an old frontend with a new backend or vice versa can use incompatible contracts/cookies.
3. If health, authorization, redirects or cleanup fail after cutover, stop only the candidate NullChannel service, switch its release pointer and matching static root back, then start the validated fallback. Reload Nginx only if the scoped site pointer actually requires it, after `nginx -t`. Do not restart neighboring applications. Calls/sockets will disconnect and users must reconnect.
4. Preserve the shared Supabase schema and durable cleanup records. Do not drop new tables, truncate queues or restore an entire database backup as an application rollback. Do not recreate expired rooms/messages/media from backups. Persistent account/friendship data created after cutover must remain protected; returning to a guest-only UI may leave registered functionality temporarily unavailable.
5. Confirm fallback liveness, expected origin/security headers and continuing authorized cleanup processing. If no safe schema-compatible fallback exists, keep the service in a controlled maintenance state and repair forward. Restoring old code alone must not abandon registered expiration/media jobs.

## Recommended deployment sequence and neighboring VPS risk

1. Operator gathers the release-gate evidence above without changing configuration or user records during this review. Record explicit acceptance of remaining product warnings and a physical-device check where launch promises depend on it.
2. Inventory listening ports, current Node/service/Nginx paths, RAM/disk headroom and neighboring applications. Protect the existing NullChannel release/config and prepare the verified rollback artifact. No on-host resource inventory was available here; capacity adequacy cannot be certified.
3. Package the complete reviewed workspace into an isolated release; install from lockfile and build off the live application's directory. Do not overwrite files beneath a running process or share mutable dependency directories with neighboring apps. Build can consume substantial CPU/RAM; use an isolated builder or a reviewed maintenance window.
4. Privately validate candidate environment, same-origin build, existing project/account endpoints and Auth allowlist. Run only one active global cleanup worker. A candidate preflight against the shared database must disable background cleanup until its scope is reviewed; never leave that override on the final serving process.
5. After separate deployment authorization, stop only the old NullChannel process, atomically switch paired artifacts and start the new unit with reviewed regular cleanup enabled. Do not apply migrations: the required versions are already present. Test Nginx syntax before any scoped reload; preserve other hostnames, certificates and upstreams. Do not replace global Node, firewall rules or shared Nginx configuration.
6. Check liveness, Auth redirects, WebSocket upgrade/reconnection and one disposable private-media fixture, then observe actual hosted worker logs and fixture-only deletion evidence. These targeted cutover checks do not require repeating the full 22-workflow audit. Clean up only recorded fixtures through authorized paths.
7. Monitor failures and cleanup cadence with a named owner; roll back paired code artifacts promptly if a gate fails. Keep rollback available through the observation window.

Primary risks to neighboring VPS apps are port collisions, shared Node upgrades, broad Nginx edits/reloads with invalid configuration, disk/build memory pressure, shared filesystem permissions and running duplicate services against the same database. Dedicated service user, protected env, loopback port, separate release paths and narrowly scoped service control reduce these risks; example files do not prove they are installed.

## Prerequisite closure follow-up (read-only)

This follow-up did not repeat builds, feature tests or Auth tests. Branch remains `feat/nullchannel-v2`. Local configuration names/presence, available access mechanisms, scheduling source, deployment examples and historical rollback instructions were inspected again. No writes to production, migrations, restarts or configuration changes were performed.

### Requested checklist

| Prerequisite | Status | Evidence / exact missing evidence |
| --- | --- | --- |
| Production ImageKit | **BLOCKED** | Local endpoint equals the expected custom endpoint. No supplied VPS host/login or remote configuration access establishes the running production value. Public delivery URLs and local `.env` cannot prove it. |
| Auth redirects | **BLOCKED** | Source constructs `${CLIENT_URL}/login` and `${CLIENT_URL}/reset-password`, compatible with the required production paths. No Supabase Management token/configuration or dashboard export is available to establish Site URL and the allowlist. No missing entry has been proven. |
| Hosted cleanup | **BLOCKED** | Candidate source schedules cleanup inside the Node process; no VPS journal, deployed artifact or scheduler inventory is available. No actual hosted execution or restart recovery is claimed. |
| VPS isolation | **BLOCKED** | Example unit/site use `nullchannel.service`, loopback 5050, `/srv/nullchannel`, Nginx, and Node 22.12+. Those are examples, not identified live settings. Actual service, listener, proxy, directory, Node executable and resource budget are unknown. |
| Rollback artifact | **BLOCKED** | No deployed release manifest, artifact path, hashes or paired frontend/backend backup was supplied. Local commit `2333b09` is not evidence of the deployed revision or a validated fallback. Historical docs do not establish a usable v22-compatible artifact. |

Access findings: no local SSH config, no supplied VPS target variables (only a local SSH-agent socket), no Supabase CLI token file or management token in the checked process/server configuration, and no connected SSH/Supabase management tool. An agent socket alone neither identifies the VPS nor proves authorized connectivity; no host or login was guessed. Supabase API/SQL credentials do not substitute for access to the VPS process environment or the Auth control-plane URL configuration.

### Read-only VPS commands for the operator

Run on the actual VPS through the existing authorized connection. These commands inspect only; they do not restart/reload services, trigger cleanup or change files. Replace the unit below only after identifying the real service. If it is managed by Docker/PM2 instead, provide the equivalent selected process metadata and redacted logs; do not print full `docker inspect`/`pm2 env` output containing credentials.

```sh
systemctl list-units --type=service --all --no-pager
systemctl list-timers --all --no-pager
sudo ss -ltnp
df -h
free -h

# Example name only: identify the actual unit from the inventory first.
NULLCHANNEL_UNIT=nullchannel.service
sudo systemctl show "$NULLCHANNEL_UNIT" \
  -p ActiveState -p SubState -p MainPID -p User -p WorkingDirectory \
  -p FragmentPath -p EnvironmentFiles -p Restart -p NRestarts
NULLCHANNEL_PID=$(systemctl show "$NULLCHANNEL_UNIT" -p MainPID --value)
ps -p "$NULLCHANNEL_PID" -o pid,lstart,etime
```

Do not share the full service definition or process environment. The following prints only comparison results, selected non-secret runtime names and the real executable/directory. It reads the process environment privately. Variables loaded later by dotenv may be absent from Linux `/proc/.../environ`; in that case the comparison is UNKNOWN, not a failure. An environment file alone can also be stale relative to the running process. Correlate it with the unit, process start time and deployed code without displaying secrets.

```sh
sudo python3 - "$NULLCHANNEL_PID" <<'PY'
import json, pathlib, subprocess, sys
pid = int(sys.argv[1])
if pid <= 0:
    raise SystemExit('No running main process; inspect the actual supervisor.')
root = pathlib.Path('/proc') / str(pid)
raw = (root / 'environ').read_bytes()
env = dict(item.decode(errors='replace').split('=', 1)
           for item in raw.split(b'\0') if b'=' in item)
def compare(name, expected):
    return 'UNKNOWN' if name not in env else ('MATCH' if env[name] == expected else 'MISMATCH')
exe = str((root / 'exe').resolve())
print(json.dumps({
    'process_directory': str((root / 'cwd').resolve()),
    'executable': exe,
    'IMAGEKIT_URL_ENDPOINT': compare('IMAGEKIT_URL_ENDPOINT', 'https://ik.imagekit.io/6kzjhzid5/nullchannel'),
    'CLIENT_URL': compare('CLIENT_URL', 'https://nullchannel.teleflow.cyou'),
    'NODE_ENV': compare('NODE_ENV', 'production'),
    'HOST': env.get('HOST', 'UNKNOWN'),
    'PORT': env.get('PORT', 'UNKNOWN'),
    'BACKGROUND_CLEANUP_ENABLED': env.get('BACKGROUND_CLEANUP_ENABLED', 'UNKNOWN'),
    'credential_names_present': {name: bool(env.get(name)) for name in [
        'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
        'IMAGEKIT_PUBLIC_KEY', 'IMAGEKIT_PRIVATE_KEY']}
}, indent=2))
# Execute only if the discovered executable is actually Node, not a supervisor.
if pathlib.Path(exe).name.startswith('node'):
    print('node_version=' + subprocess.check_output([exe, '--version'], text=True).strip())
PY
```

A MATCH establishes the inspected process's startup environment setting, subject to the deployed code using it. Confirm that the deployed ImageKit initialization reads `IMAGEKIT_URL_ENDPOINT`, rather than overriding it. If dotenv supplies it, inspect that specific file privately and report only the comparison and whether it predates process start. Do not change a mismatching value in this task.

Inspect logs through a whitelist so private data or credentials in other journal lines are not copied into the report:

```sh
sudo journalctl -u "$NULLCHANNEL_UNIT" --since '24 hours ago' --no-pager -o cat |
python3 -c '
import sys,json
ops={"server_started","shutdown_started","shutdown_complete","cleanup_complete",
     "cleanup_failed","burn_cleanup_failed","match_sweep_failed",
     "media_cleanup_failed","upload_intent_recovery_failed","startup_failed",
     "unhandled_rejection","uncaught_exception"}
fields={"timestamp","operation","severity","port","removedRooms","attempts","retryRecorded"}
count=0
for line in sys.stdin:
 try:
  item=json.loads(line)
  if isinstance(item,dict) and item.get("operation") in ops:
   print(json.dumps({k:v for k,v in item.items() if k in fields}));count+=1
 except (ValueError,TypeError): pass
print(json.dumps({"matching_operational_log_lines":count}))
'
```

Recurring `cleanup_complete` timestamps establish room/media worker invocation. Deletions may still be pending/retrying. For restart evidence, use historical `server_started` followed by new cleanup entries and the supervisor's restart/boot metadata; do not restart the service to manufacture evidence. If the process predates the 24-hour window, inspect a suitable earlier interval with the same whitelist. Zero matching lines is inconclusive for a legacy build or another log destination. Burn and match success are not logged on every tick, so room completion logs alone do not prove those loops executed.

Candidate scheduling does not require a separate OS cron/timer or worker process: minute cleanup plus one-second Burn/match loops live in `server.ts`, with immediate room/Burn cleanup at startup. The example systemd unit restarts failed processes. Durable database leases expire after five minutes so interrupted media claims can be retried by a later worker. These source facts support recovery design, not hosted proof. No missing production cron/job has been identified; the scheduler and deployed supervisor remain unknown. The secret-protected manual cleanup endpoint is not a complete substitute for all loops and must not be invoked here.

To inspect proxy/isolation, run `sudo nginx -t` (syntax check only). Inspect `sudo nginx -T` **privately on the VPS**, locate only the server block for `nullchannel.teleflow.cyou`, and report the non-secret `server_name`, static `root`, `/api/` and `/socket.io/` upstream host/port, upgrade handling and real-IP trust boundary. Do not paste the full Nginx output: it can contain unrelated applications or credentials. Determine whether Nginx connects directly or through cloudflared/another proxy. Compare the actual upstream with `ss` and the process directory. No reload is needed for inspection. Do not treat Cloudflare's public IP as the VPS address.

After discovering the real release directory, inspect its manifest and candidate rollback paths, not a guessed `/srv/nullchannel`:

```sh
cd /actual/nullchannel/release
pwd -P
git rev-parse HEAD
git status --short
sha256sum server/dist/server.js client/dist/index.html package-lock.json
```

If the artifact is not a Git checkout, use its existing release manifest instead. The three checksums identify entrypoints/lockfile, not the entire dependency/static tree: inventory all hashed frontend assets, backend files and runtime dependencies privately. Provide the existing previous-release path, revision/manifest, Node version, dependency provenance and paired artifact hashes. Do not copy, replace or create a deployment backup in this read-only task. No usable artifact can be named until this evidence is supplied.

### Dashboard inspection required

In the **existing Supabase project**, Authentication → URL Configuration, report only:

- Site URL equals `https://nullchannel.teleflow.cyou`: yes/no.
- Redirect allowlist permits `https://nullchannel.teleflow.cyou/login`: yes/no.
- Redirect allowlist permits `https://nullchannel.teleflow.cyou/reset-password`: yes/no.
- Whether permission is exact or via an existing matching wildcard; exact entries are preferable, but a matching existing wildcard is compatible and must not be falsely called missing.

No settings should be edited. Do not perform signup/recovery again. A redacted URL-configuration export/screenshot or read-only existing management configuration is sufficient for this configuration check. Signup/recovery paths are confirmed in `server/src/routes/account.routes.ts`; the running backend's CLIENT_URL must match. ImageKit dashboard endpoint metadata may corroborate the expected account/endpoint, but cannot establish which value the VPS process uses. No SMTP/DKIM inspection or changes are needed.

### Rollback disposition and remaining manual actions

The schema-preserving rollback procedure above remains the required design: retain/switch a matching frontend/backend/dependency artifact, preserve v22 and durable jobs, and ensure the fallback enforces private-media access and handles registered expiration/cleanup. No rollback commands will be executed by this review. The historical `docs/UX_POLISH.md` points to the old `Arbab-ofc/NullChannel` repository and describes an earlier Burn rollback; `docs/VOICE_CALLING_AUDIT.md` warns against an older frontend without its WebSocket correction. Neither is a validated fallback for this upgrade. Do not select those commits or follow those installation instructions blindly.

Exact remaining actions are: (1) supply the existing VPS target/access configuration path or run the read-only commands above and return redacted results; (2) provide the three Supabase dashboard comparison results; (3) provide recurring cleanup and historical post-restart evidence, or keep cleanup BLOCKED; (4) identify actual unit/port/proxy/directory/Node and available capacity; (5) identify and document a complete existing fallback artifact compatible with v22. Artifact existence alone does not verify compatibility; absent existing evidence, a separate isolated compatibility review is needed before it can pass. Do not test that artifact against real-user records here.

**Decision remains CONDITIONAL GO. All five prerequisite checklist entries are BLOCKED by missing production evidence; this is not a finding that all five are misconfigured. Immediate replacement is not cleared.** No new access request authorizes deployment, configuration edits or production writes.

## Final answer

NullChannel can replace the deployed version **after the release gates are satisfied and the documented warnings are accepted**. It cannot yet be certified safe for immediate replacement from the evidence available here. Production environment/redirect/media checks, actual hosted cleanup execution and a schema-compatible rollback are the outstanding operational prerequisites. No deployment was performed or authorized by this review.
