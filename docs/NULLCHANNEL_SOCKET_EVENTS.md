# NullChannel Socket.IO contracts

The application extends the existing Socket.IO server; there is no separate social server. API and browser socket origin come from the existing same-origin deployment configuration. The client uses credentialed cookies; account-channel and room-channel sockets share infrastructure but different authorization scope.

## Connection and room authorization

Socket handshake rejects an incorrect Origin and limits connections. A verified account with no `auth.roomCode` gets a social-only connection. A registered room handshake includes `{roomCode}` and requires its server-side identity mapping. Otherwise a valid guest cookie session is required. Private account UUIDs remain server-side. Periodic/session packet checks reject expired credentials. A registered socket cannot become a member simply by submitting another sender ID or emitting join-room; REST join/invitation acceptance must authorize membership first.

The room join payload is `{roomCode,senderId,senderName}` subject to schema validation. Registered identities/names are obtained from authenticated socket state. `room-joined` adds `self_sender_id`, `self_sender_name`, `self_role` for the joining registered participant. Socket room IDs are internal room identifiers, not account IDs.

## Browser to server

| Event | Payload | Authorization/behavior |
|---|---|---|
| `join-room` | `{roomCode,senderId,senderName}` | Verified guest joining or existing registered membership. |
| `send-message` | Room/sender fields, `type`, text/media fields, optional reply/Burn/timed/view-once fields | Server-derived identity, room/member checks, Zod bounds, database insertion guard. |
| `typing` | Room/sender fields and typing state | Current room membership. |
| `leave-room` | Room/sender fields | Marks own membership left and leaves socket room. |
| `presence:heartbeat` | Optional `{status:"online"\|"away"\|"invisible"}` | Verified account; extends server lease. |
| `presence:set` | `{status:"online"\|"away"\|"invisible"}` | Account status applied to its tabs, filtered for observers. |
| `call:invite` | `{roomCode}` | Eligible two-participant private room, active membership, peer availability. |
| `call:accept`, `call:reject`, `call:end`, `call:connected`, `call:reconnecting` | `{callId}` | Current participant/socket call ownership. |
| `call:offer`, `call:answer` | `{callId,revision,sdp}` | Bounded encrypted audio-only SDP; revision 1–5. |
| `call:ice-candidate` | `{callId,revision,candidate}` | Bounded single audio m-line candidate structure. |

Call events accept a callback returning `{ok:true,callId?}` or `{ok:false,code,message}`. A malformed/unauthorized call payload is not forwarded. No group conference event exists. Only audio WebRTC is supported.

## Server to browser

| Event/domain | Payload/use |
|---|---|
| `connection-status` | `{connected:true}`. |
| `socket-error` | Sanitized `{code,message}`. |
| `room-joined`, `receive-message` | Authorized room metadata/message records with temporary sender identities. |
| `user-joined`, `user-left`, `user-typing` | Room-specific transient participant/typing data. |
| `participants-updated` | `{roomId,online:[temporary sender IDs]}`. |
| `membership-revoked` | `{code}`; client must stop sending/leave room. |
| `room-expired` | Termination reason; server ends calls and leaves socket room. |
| `room-extended`, `room-wiped` | Expiry extension or transcript-wipe update. |
| `message-deleted`, `message-edited`, `message-burned`, `message-reactions`, `message-pinned` | Room-specific message mutation events. |
| `presence:update` | `{username,presence}` only to authorized observers; invisible/hidden users appear offline. |
| `friend:request`, `friend:accepted`, `friend:updated` | Account-scoped invalidation `{updated:true}`. |
| `invitation:received` | Account-scoped invitation ID/expiry, without message content. |
| `notifications:update` | Account-scoped invalidation `{updated:true}`. |
| `match:status` | `idle`, `searching` with deadline, `proposal` with ID/deadline/own acceptance, or `matched` with code. No peer permanent identity. |
| `directory:updated` | `{refresh:true}` to registered-directory viewers. |
| `poll:update` | Sanitized poll question/options/results/expiry/closed state. Fetch own list for `myChoice` and `canClose`. |
| `moderation:update` | `{senderId,action}` using temporary sender ID. |
| `account:error` | Sanitized presence/setup failure. |
| `call:incoming`, `call:outgoing` | Call ID, room, permitted peer display alias and timeout configuration. |
| `call:accepted`, `call:connected`, `call:reconnecting` | Call lifecycle transition. |
| `call:offer`, `call:answer`, `call:ice-candidate` | Authorized peer negotiation data. |
| `call:rejected`, `call:timeout`, `call:ended`, `call:busy`, `call:error` | Termination/failure reason; cleanup peer connection/tracks. |

Mutual identity reveal/connect is currently a REST consent protocol. There is no implemented `identity:revealed` socket event; do not invent that contract. Response consent belongs only to the current room.

## Reconnection and operational limits

Frontend listeners are removed on unmount. Reconnect obtains current server state and cannot restore a destroyed room. Account sockets heartbeat every 30 seconds; presence qualifies connections for 90 seconds and checks stale sockets every 30 seconds. Multiple tabs preserve presence until the final qualifying connection ends. Calls and presence are process-local; one backend instance is required for current semantics.

Local socket/auth/call tests exercise selected behavior. Full hosted registered sockets, two-device audio and browser network/sleep scenarios remain unverified. Browser timers/countdowns do not authorize membership, invitations or expired matching state.
