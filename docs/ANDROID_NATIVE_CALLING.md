# NullChannel native Android calling implementation

The branch preserves the keyboard fix and temporary TURN endpoint from commit
`23e8111`. Native system-bar padding remains separate from Android IME resizing.
The website keeps its browser WebRTC engine, cookies, and existing layout.
Android chooses a native audio-only WebRTC peer through the manually registered
`NativeCalls` Capacitor plugin. The root project now discovers `@capacitor/app`.

## Implemented ownership

- `NativePeer` owns the native `org.webrtc` peer, audio source/track, AudioDeviceModule
  and application context. It does not depend on an Activity-owned WebView for media.
  The pinned distribution is `io.github.webrtc-sdk:android:150.7871.01`.
- `CallForegroundService` uses the microphone service type and starts after the
  visible app/user notification Answer path obtains microphone permission. It has
  an ongoing notification and explicit teardown; it is not restarted without a
  valid process-owned peer.
- `NativeAudioController` requests communication focus, guards system phone-call
  audio, handles focus interruptions, selects communication devices on API 31+,
  and uses compatible older routing fallbacks. Microphone mute and focus suspension
  are separate. It restores mode/routing and abandons focus at teardown.
- `NativeNetworkMonitor` observes the default Wi-Fi/mobile/VPN transport with a
  debounce. Healthy WebRTC audio can migrate naturally before a restart is requested.
- Original PCM WAV ringtone/ringback/message/connected/ended sounds are generated
  by `scripts/generate-notification-audio.py`. No external recordings were used.
- `IncomingRingingService` loops the ringtone within the invitation deadline,
  uses a bounded media-playback foreground service where permitted, and is stopped
  by answer, decline, cancellation, expiry and logout. Silent/DND settings remain
  respected; native notification channels control vibration and the fallback alert.
- The React call coordinator is global on Android. Guest and account invitation
  channels can open a room independently of ChatPage. Call and page transports have
  separate owners; the final owner releases the transport. A shared microphone
  lease prevents voice-message capture from overlapping a call across rooms.
- Activity recreation reconciles an existing native peer with an authorized server
  snapshot. A mobile-session-bound takeover can replace the old signaling socket.
  A fresh process with no native peer never pretends to restore the old media.

## Signaling and recovery

New invitations advertise protocol 2. Legacy website clients remain accepted.
Protocol 2 adds call-scoped message IDs, serialized server processing, bounded
idempotency receipts and unacknowledged signal replay. The receiver acknowledges
processed signals. ID reuse with changed data is rejected. Candidate revisions
older than the active negotiation are discarded safely.

Server snapshots include phase, state version, negotiation revision, both participant
readiness flags, deadlines, room expiry and recovery state. Negotiation waits for
both participants to rejoin. Recovery is serialized, with pending restarts and
three actual restart attempts per outage rather than a lifetime limit of five.
Descriptions and ICE are buffered/deduplicated. Old acknowledgments cannot end a
new call. Healthy signaling-only reconnection does not arm a media failure timer.

TURN leases include expiration. Requests are authenticated, have a five-second
budget, and are aborted on call teardown. The peer applies fresh configuration
before restarting ICE. Native media also has establishment/outage deadlines
independent of JavaScript, preventing orphan microphone capture if the UI runtime disappears. An unavailable legacy endpoint retains STUN/host candidates;
this is not a substitute for a functioning TURN relay.

Diagnostics include connection states, protocol, relay use, packet counts/loss and
ICE-server error codes. Native internal WebRTC logging is disabled. Credentials,
SDP, private addresses, room references and message bodies are not diagnostic fields.

## Background continuity: partial end-to-end implementation

Native audio is owned by a process-scoped native peer and foreground service, so
Activity pause does not automatically hang up and media does not require WebView
getUserMedia/playback. There is still an architectural limit: Socket.IO signaling,
credential renewal, SDP scheduling and much of call-state reconciliation are in
JavaScript. Android can suspend that runtime while the native peer continues audio.
Network recovery or credential/session renewal during that suspension is therefore
not guaranteed. Native events are bounded and replayed when the Activity returns.

Reliable long-running background signaling needs a service-owned native signaling
transport plus coordinated mobile credential renewal/ownership transfer. That
migration is unfinished. Do not market this branch as fully reliable background
calling until this work and a physical device matrix are completed.

Task removal/process termination can end signaling or media. Services use
`START_NOT_STICKY`; no microphone service starts at reboot. No uninterrupted call
survival after process kill, force-stop or reboot is promised. Firebase can deliver
a new invitation when Android permits; each invitation is revalidated.

## Remaining implementation and validation

- Service-owned native Socket.IO/signaling and background credential renewal.
- Reliable live TURN/Firebase delivery, which requires operator infrastructure.
- Physical Android audio/Bluetooth, lock-screen, DND, foreground service and OEM
  background behavior validation. Robolectric tests are framework simulation.
- Native RTP/DTLS interoperability and real microphone quality across supported
  devices; Java compilation and mocked signaling tests do not establish this.
- Distributed call/subscription coordination if the backend gains multiple workers.
- Full-screen call takeover/Telecom integration is not added; standard CallStyle
  notifications are used within Android restrictions.

No call recording, message-content notification storage, new Supabase project,
production migration or production deployment is introduced.

## Source map

| Area | Implementation |
|---|---|
| Native peer, focus and routing | `android/app/src/main/java/com/nullchannel/android/NativePeer.java`, `NativeAudioController.java`, `CallForegroundService.java` |
| Push and notification actions | `NullChannelMessagingService.java`, `NativeNotifications.java`, `CallActionReceiver.java`, `NativePushApi.java`, `NativeVault.java`, `PushTokenWorker.java` in the same Java package |
| Ringtones and network events | `NativeRingtones.java`, `IncomingRingingService.java`, `NativeNetworkMonitor.java`, `NativeCallsPlugin.java` |
| App-wide ownership | `client/src/lib/native-call-coordinator.ts`, `active-calls.ts`, `call-ownership.ts`, `socket.ts` |
| Media and recovery adapter | `client/src/lib/native-calls.ts`, `webrtc.ts`, `voice-call.ts`, `ice-lease.ts` |
| Authorized delivery | `server/src/services/push.service.ts`, `message-notification.service.ts`, `call-delivery.ts`, `server/src/routes/push.routes.ts`, `call.routes.ts`, `server/src/sockets/call.socket.ts` |
| Framework simulations | `android/app/src/test/java/com/nullchannel/android/NativeCallingTest.java`, `client/src/tests/call-reliability.test.ts`, `server/src/tests/push.test.ts`, `push-routes.test.ts`, `call.integration.test.ts` |
