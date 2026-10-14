# Local delivery and future rollout checklist

## Build and provider setup

1. Keep Firebase configuration and Admin credentials outside version control;
   follow `FIREBASE_ANDROID_SETUP.md`.
2. Provision/review coturn separately using `TURN_DEPLOYMENT.md`; validate real UDP,
   TCP and TLS allocations before enabling its backend variables.
3. Review the feature branch, including backward-compatible website signaling.
   Deploying backend changes, merging and releasing an APK require a separate task.
4. Run the standard Node checks and Capacitor sync, then Android lint, unit tests and
   assembleDebug with Java 21 and the existing Android SDK.
5. Add a release-signing/Play Console review for microphone/mediaPlayback foreground
   service declarations, notification policies and the native WebRTC dependency.

## Real-device acceptance (not performed here)

- Android supported minimum through target API; gesture/three-button navigation,
  portrait/landscape, keyboard composer position and existing navigation/branding.
- Notification permission grant/deny, channel disable, silent/vibrate/DND, screen
  lock, foreground active-chat suppression, grouped privacy-safe message alerts.
- Firebase registration, rotation, guest/account session expiry, logout, invalid
  tokens and multiple devices; never capture real message contents in logs.
- Incoming calls on other pages, in background and after normal process recreation;
  Answer/Decline/caller cancellation/expiry/answered elsewhere and delayed pushes.
- Earpiece/speaker, wired headset, Bluetooth/BLE, permission denial and unplug events;
  transient/permanent audio focus interruption and post-call restoration.
- Wi-Fi/Wi-Fi, Wi-Fi/mobile, mobile/mobile, differing operators, permitted VPNs,
  restrictive NAT and actual TURN relay/TCP/TLS. Verify the selected candidate pair.
- Network loss/restoration, simultaneous peer reconnect, Socket.IO loss/replay,
  expired TURN refresh, bounded recovery, room expiry and logout during a call.
- Activity recreation and background use for longer than the API token lifetime;
  document the JavaScript signaling suspension limit rather than declaring success.
- Task removal, process kill, force-stop, reboot and first unlock. Verify no orphaned
  microphone, ringtone, focus, route or foreground notification survives teardown.

## Production actions still requiring an operator

- Select/configure Firebase and credentials, secure the encrypted push store, and
  enable `PUSH_ENABLED` only after staging validation.
- Choose TURN public hostname/IP, install/configure coturn, supply a valid TLS
  certificate, open reviewed listening/relay ports and set backend TURN variables.
- Schedule a reviewed backend rollout and APK release. The deployed website frontend
  need not be rebuilt/replaced for this Android release.
- Do not declare production readiness until native background signaling and the
  real-device/provider acceptance gaps in `ANDROID_NATIVE_CALLING.md` are resolved.

## Local validation evidence (14 October 2026)

- `npm run lint`: passed.
- `npm run typecheck`: passed for client, server and manual harness.
- `npm test`: backend 210 passed, 61 skipped; frontend 228 passed.
  Skipped suites require optional disposable PostgreSQL/browser fixtures and were
  not enabled. Socket.IO integration and native bridge/framework simulations
  use local fixtures; live Firebase/TURN connectivity is not substituted by these.
- `npm run build` and `npm run android:sync`: passed.
- Android `lint`, `testDebugUnitTest`, `assembleDebug`: passed with Java 21,
  installed Android SDK, API 24 minimum / API 36 target. Eighteen Android unit tests
  passed; lint reported 35 warnings and no errors. Most warnings concern existing
  manifest ordering and dependency/tooling versions; passing lint is not zero warnings.
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`, approximately
  55 MiB, containing arm64-v8a, armeabi-v7a, x86 and x86_64 native libraries.
- `git diff --check`: passed. Keyboard inset policy, app branding and existing
  navigation configuration were preserved. No credentials, database migrations,
  production deployment or physical-device tests were performed.

One repeated run during concurrent validation failed the ringing timeout assertion
and manual harness graceful shutdown check. Subsequent isolated full runs passed.
This is a remaining timing sensitivity in the integration harness; do not interpret
it as verified behavior under device/network load. A new native adapter test mock
also required a TypeScript return annotation; the final typecheck passed afterward.

The pinned third-party Android WebRTC distribution adds native libraries and APK
size. Before release, review its upstream provenance/licensing and security update
policy, test Android/browser interoperability and consider ABI-split release bundles.
Native media compilation and Robolectric mocks do not validate its RTP audio path.
