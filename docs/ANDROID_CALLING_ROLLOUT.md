# Native calling finalization: local delivery and rollout gates

No production deployment, database migration, live provider setup or physical-device
testing is authorized or performed by this mission. The deployed website frontend
must remain unchanged. This branch extends `1973b04` on
`feat/android-native-calling-finalization`.

## Operator configuration

### Android

- Review API 24 minimum/API 36 target behavior and release signing.
- The native transport backend is pinned by Gradle `nullchannelApiOrigin`. For an
  authorized staging build, use the same HTTPS origin for the client API build value
  and `-PnullchannelApiOrigin=https://your-staging-host`. Normal TLS validation remains
  enabled; do not replace it with trust-all certificates.
- Supply `android/app/google-services.json` locally when Firebase is configured. The
  file stays ignored. Select/configure the Firebase project manually; this mission
  creates no project and supplies no credentials.
- Review microphone/mediaPlayback foreground-service and full-screen intent store
  declarations. Android 14+ full-screen special access and notification/channel
  settings can prevent full-screen presentation. Self-managed Telecom availability
  is conditional; a default-dialer role is not requested.

### Backend

The source is compatible with existing cookie website authentication and Android
bearer authentication. Backend rollout requires a separately authorized task. Keep
all worker versions and coordination settings consistent; never mix memory ownership
and Redis ownership for the same deployment.

Single-instance default:

```dotenv
CALL_COORDINATION_MODE=memory
```

Optional multi-instance configuration (operator-held secrets, not repository values):

```dotenv
CALL_COORDINATION_MODE=redis
CALL_REDIS_URL=rediss://ACL_USER:OPERATOR_SECRET@PRIVATE_REDIS_HOST:6379
CALL_REDIS_ENCRYPTION_KEY=<64 lowercase hexadecimal characters>
```

Production Redis mode requires TLS and explicit ACL credentials. Isolate Redis from
the Internet, authenticate clients, restrict ACL access to the required call/push
keys and adapter Pub/Sub channels, and use the same encryption key across workers.
Do not publish Redis ports externally. Shared payloads are encrypted; Pub/Sub still
requires trusted access and TLS. The implementation assumes one authoritative primary.
Unfenced Redis failover/partitioned primaries are not certified safe by this branch.

The six-second mutation lease, three-second adapter request budget, database latency
and worker recovery must fit the call recovery window. The default ten-second call
grace is not a load-tested guarantee. Load-test the serialized transaction and 16 MiB
snapshot limit; increase deployment capacity only after measured validation. Redis
connection loss fails closed and requires a reviewed backend recovery/restart procedure.

### Local Redis only

`dev/redis.compose.yml` binds Redis to loopback and disables disk persistence:

```sh
docker compose -f dev/redis.compose.yml up -d
```

This is an optional local development command, not a production provisioning command.
Automated integration tests instead start a temporary loopback Redis subprocess when
a supported local `redis-server` binary exists, and stop it after testing. They use
synthetic credentials and isolated in-memory database/session fixtures.

### Firebase and TURN

Follow `FIREBASE_ANDROID_SETUP.md` and `TURN_DEPLOYMENT.md`. Required provider settings:

```text
PUSH_ENABLED
FIREBASE_PROJECT_ID
GOOGLE_APPLICATION_CREDENTIALS     # when using an operator-managed credential file
PUSH_DEVICE_STORE_PATH / PUSH_DEVICE_STORE_KEY  # optional single-instance file store
TURN_URLS
TURN_SHARED_SECRET
TURN_CREDENTIAL_TTL_SECONDS
```

Redis mode uses shared encrypted push subscriptions. File-backed subscriptions remain
a single-instance option. Firebase and coturn must be configured/tested separately;
no live delivery or relay allocation was verified by this mission.

TURN deployment needs a reachable IP/hostname, UDP/TCP 3478, TLS/TCP 5349 when used,
a reviewed UDP relay range, certificate and authentication secret. VPNs/firewalls can
still block all configured transports. No firewall/DNS/service commands are executed.

## Real-device acceptance checklist (not performed)

- Supported Android versions, gesture/three-button navigation, portrait/landscape,
  screen sizes, keyboard composer position, branding and chat navigation.
- Native caller/receiver microphone permission grant/deny; one microphone owner while
  voice-message recording; cleanup on cancellation and rapid Answer taps.
- Native incoming/outgoing UI, full-screen special access allowed/denied, heads-up
  fallback, locked/unlocked presentation, duplicate invitations and expired proofs.
- Self-managed PhoneAccount acceptance/refusal, system phone-call interruption,
  headset Answer/End, Bluetooth/BLE, wired/USB attach/detach, focus and route restoration.
- Background calls with WebView execution actually suspended, longer than access-token
  lifetime. Confirm renewal, native Socket.IO heartbeat, TURN refresh and ICE restart
  occur without JavaScript callbacks.
- Wi-Fi/Wi-Fi, Wi-Fi/mobile, mobile/mobile, different operators, permitted VPNs,
  restrictive NAT and real TURN UDP/TCP/TLS. Inspect sanitized selected relay diagnostics.
- Temporary signaling loss, active network transport change, both peers reconnecting,
  replay/duplicate SDP, remote hangup, authorization loss, room expiry and logout.
- Activity recreation, navigation, screen lock, task removal, process kill, force-stop,
  reboot and first unlock. Confirm no surviving orphan microphone/ringtone/service.
- FCM registration/rotation/revocation, multiple devices, delayed/cancelled invitations,
  process-not-running delivery where allowed, private message grouping and suppression.
- Two backend workers: simultaneous calls, native/browser interoperability, worker crash
  during mutation/publication, invitation outbox retry, stale owner fencing, deadlines,
  Redis loss and safe recovery. Do not assume Pub/Sub is durable or exactly-once delivery.

## Production rollout prerequisites

1. Review source, dependencies/security updates and the limits in
   `ANDROID_NATIVE_CALLING.md`. Native Java Socket.IO and media dependencies require
   native ABI and Android/browser RTP interoperability acceptance.
2. Complete provider configuration and the device/network matrix in authorized staging.
3. Validate Redis primary consistency, ACL/TLS, secret handling, load capacity and a
   failure/recovery plan before enabling distributed mode.
4. Validate existing account/guest creation, authentication, messaging and browser calls.
   Older website clients are supported without requiring deployed frontend replacement.
5. Obtain separate approval for a backend rollout and signed APK release. This mission
   does not merge main, restart services or deploy any artifacts.
6. Process death does not restore live media. Android/OEM policies do not guarantee
   indefinite background execution. Publish only claims supported by actual device tests.

## Local validation evidence

Validation executed locally on 2026-10-14 with installed Java 21 and Android SDK:

| Check | Actual result |
|---|---|
| `npm run lint` | Passed, server and client |
| `npm run typecheck` | Passed, server, client and manual harness |
| `npm test` | Backend: 216 passed, 61 skipped; frontend: 231 passed |
| Final frontend rerun after permission regression test | 232 passed |
| `npm run build` | Server and client passed |
| `npm run android:sync` | Passed; Capacitor App plugin discovered |
| `./android/gradlew -p android lint testDebugUnitTest assembleDebug` | Passed; 33 Android tests, zero failures; lint: zero errors, 34 warnings |
| `git diff --check` | Passed |

The 61 skipped backend checks require a separately configured isolated PostgreSQL
test database or opt-in browser WebRTC harness. No production credentials were used.
All six new Redis integration tests ran against a temporary local Redis process.
Seven native signaling integration tests use actual Java Socket.IO against a loopback
protocol server with synthetic credentials and mocked media. Other Android tests use
Robolectric, including auth rotation, native arbitration, forged notification entry,
Telecom authorization and healthy Activity recreation. These do not verify physical
Android behavior, genuine native RTP/DTLS, live Firebase or real TURN allocation.

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. It is a local debug artifact;
release signing, provider configuration and device acceptance remain rollout gates.
