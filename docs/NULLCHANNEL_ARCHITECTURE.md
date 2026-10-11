# NullChannel architecture

Audit baseline: commit 2333b09, repository https://github.com/Arbab-ofc/NullChannel-v2.0, clean main checkout. Implementation branch feat/nullchannel-v2. No push, merge, or deployment authorized.

## Current architecture
npm workspaces: client (React 19 / TypeScript / Vite 7), server (Express 5 / TypeScript / Socket.IO 4). Supabase PostgREST service-role access is server-only. ImageKit stores temporary attachments. Nginx proxies same-origin API and sockets to a loopback Node service. Node 22.12+ is required; installed 22.18.0.

## Frontend
App initially exposes /, /chat/:code and /404. main.tsx obtains an anonymous cookie session before rendering. LandingPage handles guest creation/join and active-room list. ChatPage owns transcript/composer, replies, reactions, pin, wipe, burn mode, gallery, voice-note recording and calls. Hooks own socket lifecycle, visible viewport, stable scroll anchoring and seen receipts. Existing CSS variables define dark purple/cyan/yellow and light red/blue/yellow themes. Logo/favicon and developer attribution must remain.

## Backend
app.ts applies Helmet/CORS, JSON bounds, Origin enforcement, anonymous session issuance, rate limits and membership-protected routes. Controllers use Zod schemas; services call Supabase. server.ts runs startup/minute cleanup and a one-second burn sweep. Services have bounded HTTP deadlines. Structured logs exclude message content. Existing migrations v2–v12 are forward SQL files in docs; base schema is server/supabase/schema.sql.

## REST inventory at audit
- `server/src/routes/room.routes.ts`: POST /rooms, GET /rooms/:code, GET /rooms/:code/messages, PATCH /rooms/:code/pin, POST /rooms/:code/messages/:messageId/burn-read, PATCH /rooms/:code/messages/:messageId, POST /rooms/:code/messages/:messageId/reactions, DELETE /rooms/:code/messages/:messageId, GET /rooms/:code/participants, POST /rooms/:code/extend, POST /rooms/:code/wipe, POST /rooms/:code/terminate, POST /rooms/:code/leave, GET /users/:senderId/rooms
- `server/src/routes/media.routes.ts`: POST /media/upload
- `server/src/routes/cleanup.routes.ts`: POST /cleanup
- `server/src/routes/health.routes.ts`: GET /health, GET /health/db
- `server/src/routes/session.routes.ts`: POST /session, DELETE /session
- `server/src/routes/account.routes.ts`: POST /account/signup, POST /account/login, POST /account/refresh, POST /account/logout, POST /account/forgot-password, POST /account/reset-password, GET /account/me, PATCH /account/profile, PUT /account/privacy, POST /account/password

## Socket inventory at audit
Client: join-room, leave-room, typing, send-message; call:invite, call:accept, call:reject, call:offer, call:answer, call:ice-candidate, call:end, call:connected, call:reconnecting.
Server: connection-status, socket-error, room-joined, receive-message, user-joined, user-left, user-typing, participants-updated, membership-revoked, room-expired, room-extended, room-wiped, message-deleted, message-edited, message-burned, message-reactions, message-pinned and call lifecycle events. Each packet revalidates guest sessions. Calls also validate membership and socket ownership.

## Database and authentication
Live Supabase API inspection succeeded. Tables: rooms, messages, room_members, message_reactions, anonymous_sessions, media_uploads, media_upload_intents, media_cleanup. RPC metadata includes create_room, join_room, extend_room, wipe_room, mark_message_seen, cleanup_burn_messages, cleanup_expired_rooms, queue_unused_upload, claim_media_cleanup and claim_upload_intents. Live Auth settings: email signup enabled, automatic confirmation disabled. These observations establish API-visible schema only; trigger definitions and grants require SQL catalog access.

Guest identities are random UUIDs, authenticated by opaque 32-byte access/refresh tokens in HttpOnly SameSite=Strict cookies. Only hashes live in anonymous_sessions. Registered Auth must use distinct cookies and verified Supabase users; a browser-provided UUID is never authorization.

## Room lifecycle
Private rooms reserve two participants; guest group capacity is currently unlimited. Finite expiry controls access via getRoomByCode and database guards. Creator deletion cascades messages/reactions/memberships. Expired rooms are deleted in batches. No history restoration endpoint exists. Burn receipts establish one immutable deadline exactly 60 seconds after another active member sees a message; filters revoke access before asynchronous deletion.

## Media lifecycle
Uploads persist write-ahead intents before provider calls and register verified provider file IDs. Message deletion triggers queue media deletion; abandoned uploads and ambiguous provider responses have recovery jobs. Workers claim leases with SKIP LOCKED and retry errors with bounded exponential backoff. Existing delivery URLs are public: provider deletion is eventual and URL knowledge permits access before deletion. Immediate revocation requires private provider objects and authorized delivery, not merely metadata deletion.

## WebRTC
Real audio-only peer connections for private rooms. The server keeps call state in memory and validates offer/answer/ICE and reconnect revisions. Ring/connect/disconnect deadlines and room expiry end calls. React closes peer connections and stops tracks. Group calls and TURN infrastructure are absent; do not present group call buttons.

## Technical debt and compatibility risks
- Guest-only auth bootstrapping prevents public pages loading during backend outages.
- Account UUIDs must never become chat sender IDs: session-scoped aliases are required.
- Guest SQL join/seen functions recognize only anonymous_sessions; registered room bridges need additive changes.
- No persistent social entities, registered room directory, queue, invitations or notifications exist at baseline.
- Public media URLs cannot promise immediate access revocation.
- Presence/call state assumes a single Node process; horizontal scale needs coordination.
- Hosted database changes use the configured PostgreSQL connection; destructive SQL tests remain scoped to isolated local fixtures.
- README includes older repository references and stale release claims.

## Proposed upgrades and migration sequence
Preserve guest schema/RPC contracts. v13 adds accounts/social/privacy/notifications; v14 adds registered room identities, finite public/group rooms, invitations, atomic matching and mutual consent; v15 bridges existing messaging authorization and lifecycle cleanup. Registered conversations reuse rooms/messages/media/call infrastructure. All newly created persistent relationships are independent of ephemeral room foreign keys. RLS denies direct anon/authenticated application table access; server authorization remains authoritative.

## Testing strategy
Baseline npm ci, typecheck, lint and tests: 155 passed; 28 database tests skipped without isolated DSNs. Extend tests for auth/authorization, transactional friendships and matching boundaries, registered/guest coexistence and cleanup. Scope live fixtures by explicit created IDs and remove only those fixtures. Browser evidence must distinguish screenshots inspected from widths merely requested.

## Deployment requirements
Do not deploy automatically. Migrations v13–v22 have been applied to the existing project and checksummed, configure Supabase Auth redirect allowlist for login/reset-password, preserve same-origin HTTPS proxy and cookie policy, run a single backend worker until distributed presence/calls are implemented, configure ImageKit private delivery before promising media revocation, and perform real email/WebRTC/provider verification. The Supabase CLI still reports no access token; SQL was applied through the existing configured PostgreSQL connection.


## Upgrade state after implementation

Migrations v13–v22 are applied to the existing Supabase database and checksummed. Registered Auth, profile/privacy, social/friend, direct invitation, groups/polls, discovery, notifications, matching, session cleanup and timed/view-once policies are implemented. Isolated PostgreSQL integration covers concurrency and the exact 60-second matching deadline. Scoped hosted smoke tests verified profiles/privacy, friend request acceptance, direct invitation/room creation, group invite/poll/destruction, public discovery/join/destruction, and session revocation; their accounts and rooms were cleaned up.

Remaining verification gaps include real Supabase confirmation/recovery email, hosted two-party matchmaking/presence, private ImageKit delivery (probe returned 404), external media deletion retries, physical microphone/WebRTC browser calls, group audio, multi-node coordination and a full WCAG assessment. Do not treat these as shipped-and-verified.
