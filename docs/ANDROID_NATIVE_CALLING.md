# Android native calling finalization

This branch extends `1973b04` and preserves its native WebRTC media, audio routing,
notifications, ringtones, keyboard IME policy and navigation behavior. All work is
local. No production infrastructure, deployed website or database schema was changed.

## Implementation status

| Major feature | Local implementation status | Verification limit |
|---|---|---|
| Native background signaling and mobile session renewal | Fully implemented locally | Loopback Java Socket.IO tests; no physical devices |
| Native SDP, ICE restart, replay and TURN lease refresh | Fully implemented locally | Native media is mocked in signaling tests; real RTP/TURN unverified |
| React as observer of one native Android call owner | Fully implemented locally | Unit tests and compile/build validation |
| Self-managed Telecom and incoming/outgoing Activity | Fully implemented locally | Platform/device eligibility and Bluetooth hardware unverified |
| Foreground/background/recreation cleanup and arbitration | Fully implemented locally | Android/OEM process restrictions still apply |
| Shared backend state, atomic busy locks and cross-instance delivery | Fully implemented locally for one authoritative Redis primary | Local two-instance tests; not a Redis HA certification |
| Strong consistency across Redis primary failover or partitioned Redis primaries | Not implemented | Redis asynchronous replication is not a consensus guarantee |
| Firebase delivery and real network/media acceptance | Partially implemented | Provider credentials, relay infrastructure and devices required |
| Call survival after Android process kill/force-stop/reboot | Not implemented | Deliberately not promised or automatically restarted |

## Native signaling ownership

`NativeCallSignaling.java` is the process-scoped Android owner. Its scheduled native
executor, Java Socket.IO client and native WebRTC peer own authentication, room join,
invitation/acceptance, SDP, ICE candidates, acknowledgments, replay, revisions,
readiness, deadlines, recovery and teardown. None of these essential operations waits
for React, a WebView timer or a JavaScript SDP callback.

`NativeOwnedCall` is an Android-only React observer/command facade. Browser calling
continues through `VoiceCall` and browser WebRTC. Android does not transfer the call
back to JavaScript when the Activity resumes. The same native owner remains active;
React attaches to its snapshot. Chat Socket.IO connections can still exist for chat
messages, but they do not own Android call SDP or ICE signaling.

Commands contain a call ID or native ownership generation. Native notification and
Telecom commands are also checked against the intended call before execution. Late
commands from an older call cannot terminate a newer owner. The legacy JavaScript
media-negotiation plugin methods reject requests while native signaling owns media.

The native microphone lease arbitrates native calling and the WebView voice-message
recorder before capture. The call foreground service remains microphone typed and
starts after the user's outgoing-call or Answer action and microphone permission.
Outgoing invitations can keep a pending `Calling` foreground notification before
acceptance; microphone capture starts only after acceptance. This preserves the
user-started service when the caller subsequently backgrounds the Activity. A service teardown
closes media, which also ends its native signaling owner. Activity destruction releases
only UI/plugin references and the old WebView recorder lease, not a valid native call.

## Authentication and native transport

Existing guest/account bearer sessions and the existing mobile refresh endpoint are
used. `NativeCallAuth` reads the original Keystore-encrypted credential format.
Renewal uses a shared native lock; Android React renewal also uses this path. It checks
that logout/session replacement did not occur before committing rotated credentials.
Session expiry or revocation ends the native call. There is no new anonymous transport.

Native HTTP and WebSocket traffic use the existing Capacitor origin and normal TLS
validation. The backend origin is pinned at Android build time in `CALL_API_ORIGIN`.
For an authorized staging build, set both the frontend API origin and Gradle property
`-PnullchannelApiOrigin=https://your-staging-host`. The default preserves the existing
application backend. No certificate-validation bypass is implemented.

The Java client uses websocket transport, bounded reconnect attempts, call-scoped
IDs and acknowledgment retries. Native recovery obtains fresh TURN configuration
when the lease needs renewal and applies it before an ICE restart. SDP revisions,
remote-description candidate buffering, duplicate suppression and both-peer readiness
remain enforced. Healthy media is preserved on signaling-only reconnection.

Native establishment/outage deadlines also exist in `NativePeer`; a stalled UI or
control operation cannot silently keep an orphan microphone indefinitely. Transient
HTTP snapshot errors alone do not terminate otherwise healthy media. Auth expiry,
room authorization loss, terminal state, media failure and bounded transport recovery
remain authoritative cleanup conditions.

## Telecom and native call UI

Minimum SDK is 24 and target SDK is 36. API 26+ registers a self-managed PhoneAccount
and a ConnectionService protected by `BIND_TELECOM_CONNECTION_SERVICE`. API 24/25 use
the application notification/UI fallback. The app requests `MANAGE_OWN_CALLS`, not a
default-dialer role. Telecom can still refuse a connection because of device capability,
concurrent system calls or platform policy; the application notification remains the
fallback. No system call-log opt-in or recording is added.

`NativeIncomingCallActivity` is non-exported. Notification entry consumes a single-use
Keystore-protected proof and validates current ownership or a live encrypted pending
invitation. A newly created process obtains fresh credentials and verifies the live
invitation before accepting. Saved Activity state can reattach to a still-valid owner;
it does not recreate dead media.

The native screen supports incoming Answer/Decline, outgoing cancellation, status,
duration, mute, audio output selection and hangup. It requests microphone/Bluetooth
permission when needed, hides caller details while locked and prevents duplicate
screens with singleTask launch behavior. System headset Answer/End callbacks enter the
same native owner. Bluetooth routing uses the existing modern native audio controller.
These hardware paths require real-device verification; background microphone starts
may be denied and must not be represented as universally supported.

Incoming CallStyle notifications request a full-screen PendingIntent only when the
platform permits it. Android 14+ checks `canUseFullScreenIntent()`. The Activity requests
lock-screen presentation; Android decides whether to show full-screen or heads-up UI.
There is no direct background Activity launch on push and no platform restriction
bypass. Notification permission/channel state, full-screen special access, store policy,
DND and OEM behavior affect delivery. Operators/users may need to enable special access
in Android settings. Ordinary notifications remain the fallback.

## Shared backend coordination

Memory mode is the default and retains single-instance behavior. Explicit Redis mode
uses the Socket.IO Redis adapter and an encrypted shared state transaction:

- One leased mutation owner at a time, with random ownership tokens and atomic Lua
  compare-and-commit fencing. A stale owner cannot commit or publish buffered effects.
- Shared caller/callee identity and account busy ownership, phase, readiness,
  negotiation revision, candidate bounds and idempotency/replay journals.
- Authorization is checked by the receiving worker using the existing session and
  room membership model. Cross-worker socket discovery verifies recipient sessions.
- Socket/notification effects are buffered until the state commits. SDP/ICE replay is
  retained until receiver acknowledgment, independent of the original worker.
- Distributed deadline sweeps remove expired calls and busy ownership. Missing sockets
  enter bounded recovery; live participants rejoin and rebind through authorized resume.
- A surviving worker continues shared calls after another worker shuts down. A crashed
  mutation owner loses its lease after six seconds. Configure recovery grace to cover
  that lease plus adapter/authorization latency; the default ten-second window is a
  starting point, not a measured production capacity guarantee.
- Shared call state has a 90-second TTL refreshed by active workers. If all workers
  disappear, state and its embedded busy ownership expire. Push subscriptions use a
  separate encrypted shared store with bounded session/device lifetimes.

Redis URL and encryption key must be identical across participating workers. Production
configuration requires TLS and explicit ACL credentials. No Redis deployment is performed.
No fallback to separate in-memory ownership is allowed after Redis mode is selected.

This implementation serializes shared mutations through one encrypted bounded snapshot.
It is appropriate for a reviewed small deployment and requires load testing before scale.
The snapshot limit is 16 MiB; receipts/replay queues are bounded. It is not sharded or a
claim of high-throughput architecture. Privacy counters may lag shared state briefly;
authorization and mutation decisions always use the shared transaction.

Redis adapter Pub/Sub is not durable delivery. Active clients reconcile authoritative
snapshots and replay SDP/ICE after reconnect; native calls also check state periodically.
If a worker dies immediately after commit,
state/replay survive. An encrypted bounded notification outbox is retried by surviving workers and removed after publication succeeds. Publication is not proof of delivery to a device; client deduplication and invitation revalidation remain necessary. FCM is
also best-effort. Exactly-once external notification delivery is not claimed.

A single authoritative Redis primary is required. Partitioned independent primaries or
asynchronous Redis failover that loses acknowledged writes are outside the correctness
claim. A consensus-backed deployment/failover fencing design would be required to close
that infrastructure-level gap. Redis loss fails closed; credentials are not logged.
The current Redis clients require a reviewed backend recovery/restart procedure after
loss of their connections. This mission does not restart any live service.

## Dependencies and security

Native Socket.IO 2.1.2 is added for backend protocol compatibility. OkHttp 4.12.0 is
explicitly selected and exercised by the loopback tests. Desugaring supports native
Java time/async APIs on API 24. MockWebServer is test-only. Backend Redis and Socket.IO
adapter dependencies are used only when distributed mode is selected.

Credential bundles/device proofs/pending invitations remain Keystore encrypted. Shared
Redis snapshots and push subscriptions are AES-256-GCM encrypted with an operator-held
key. TLS/ACL/isolation protect Pub/Sub, which can contain sensitive signaling metadata.
No SDP, tokens, TURN passwords, room secrets, private addresses or message contents are
logged by the added implementation. Media remains WebRTC DTLS-SRTP; no recording exists.

## Limits and acceptance

Native media/signaling now run outside the WebView, but Android does not guarantee
indefinite execution. Process death ends native media. Pending FCM invitations can be
validated when Android permits delivery; force-stop, reboot, provider delay and power
restrictions are not bypassed. No microphone service restarts at reboot.

Live Firebase, TURN UDP/TCP/TLS, genuine native RTP/DTLS interoperability, headset controls,
lock-screen behavior, long background calls and OEM power management remain device/provider
acceptance checks. Loopback protocol, mocked media and Robolectric tests are not physical
Android verification. See `ANDROID_CALLING_ROLLOUT.md` for validation and release prerequisites.
