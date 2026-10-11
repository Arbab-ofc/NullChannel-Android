# NullChannel matchmaking

Implementation: `server/src/routes/match.routes.ts`, `server/src/services/registered-realtime.service.ts`, `server/src/services/presence.service.ts`, migrations v14/v16/v19, and `client/src/pages/TemporaryPages.tsx`.

## State and deadlines

Only a verified registered account can search. An active `nc_presence` lease and enabled `privacy_settings.matchmaking` are required. A search uses one `nc_match_queue` row per account, with a database-recorded deadline of `clock_timestamp() + interval '60 seconds'`. Repeated starts return the current state rather than duplicating a live search. A separate active match is returned as `matched`.

`nc_match_start` selects an eligible waiting account, excludes blocks and short-lived rematch exclusions, creates a proposal, reserves both accounts and removes their queue entries in one PostgreSQL transaction. Match operations serialize through a transaction advisory lock. Reservations have a unique account key. This intentionally favors correctness at the current single-server scale; it is not a high-throughput distributed matching architecture.

A proposal has its own 15-second database deadline. Either participant can reject. Acceptance updates only the authenticated participant's consent. Both acceptances are required before `nc_create_registered` creates a fresh 60-minute private room and random aliases. No active room is created while users are searching or awaiting the first acceptance.

All expiration checks use `deadline <= clock_timestamp()`. Sweep/status/accept/start operations reject expired coordination state. The backend worker invokes the sweep every second, and relevant RPCs sweep inside their transaction. Physical row removal may occur on the next worker tick; deadline eligibility does not wait for that tick. There is no claim that a timer schedules a database deletion at an infinitely precise wall-clock instant.

## API

All routes use the `/api` prefix, verified account cookies and the configured Origin for mutations.

| Method | Route | Body | Result |
|---|---|---|---|
| POST | `/match/start` | none | current state |
| GET | `/match/status` | none | current state |
| POST | `/match/cancel` | none | `{state:"idle"}` |
| POST | `/match/proposals/:id/accept` | none | proposal or matched state |
| POST | `/match/proposals/:id/reject` | none | idle state |
| POST | `/match/rooms/:code/consent` | `{purpose:"reveal"\|"connect",accept:boolean}` | mutual consent result |
| POST | `/match/rooms/:code/block` | none | block and access revocation result |

States are `{state:"idle"}`, `{state:"searching",deadline}`, `{state:"proposal",proposalId,deadline,accepted}` and `{state:"matched",code}` inside the standard JSON envelope. No counterpart account ID, username, email or profile appears in a search/proposal response.

The frontend receives `match:status` on the existing authenticated Socket.IO server. It refreshes status on initial mount/reconnection and at deadlines. Its visual countdown is not authorization. It displays the specified timeout wording when a search ends without a proposal. A proposal timeout is a separate state.

## Disconnect, anonymity and consent

Presence tracks multiple socket connections. The final qualifying disconnect cancels queue/proposal state; heartbeat expiry also invalidates eligibility. Invisible presence removes eligibility. Reconnection does not manufacture a new search.

`nc_room_identities` keeps authenticated ownership and random room sender IDs server-side. Alias payloads reveal no permanent account UUID. Random rooms begin anonymously. `nc_room_consents` is scoped to room, account and purpose. Unilateral/rejected consent returns no profile. Two active participants must explicitly accept the same purpose before revealing a minimal profile or inserting a normalized persistent friendship. Consent and aliases cascade with room deletion. Friendship has no room/message foreign key.

Activation creates a five-minute rematch exclusion; a fresh search cannot immediately match the same partner. Skip uses temporary-room termination, then returns to matching. A new accepted proposal always creates a new room.

## Evidence and limits

Isolated real PostgreSQL tests passed for deadline boundaries, mutual acceptance, block filtering, concurrent queue entry, duplicate-room prevention, rejected reveal, mutual connection and friendship survival after room destruction. A real 60-second sleep verified search expiration, queue removal and absence of a room. These fixtures roll back or explicitly remove their own records.

Hosted additive migrations v13–v22 are applied and checksummed. Scoped hosted account, profile/privacy, friendship, direct invitation, group poll/invite, public discovery and session-revocation workflows passed using disposable Auth accounts and their owned rooms, which were removed in cleanup. Actual hosted matchmaking, recovery email and provider media delivery remain unverified. No claim of successful hosted matching or production rollout is made.
