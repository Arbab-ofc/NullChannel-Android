# Firebase setup for NullChannel Android

No Firebase project was created and no provider credentials were supplied or used.
The application and backend compile with push delivery disabled.

## Operator setup

1. Select an existing Firebase project or create one manually after approval.
2. Register Android package `com.nullchannel.android` and obtain its
   `google-services.json`. Place it locally at `android/app/google-services.json`.
   The file is ignored by Git. It is never generated from invented values.
3. Enable Cloud Messaging. Supply the backend's Firebase Admin identity through
   workload identity/application default credentials, or an operator-managed
   service-account file outside the repository. Restrict access to the file.
4. Set backend `PUSH_ENABLED=true`, `FIREBASE_PROJECT_ID`, and, if using a file,
   `GOOGLE_APPLICATION_CREDENTIALS`. Delivery uses the Admin SDK's FCM HTTP v1 API.
5. For subscriptions to survive a single backend process restart, set
   `PUSH_DEVICE_STORE_PATH` and a random 32-byte key represented by 64 lowercase
   hexadecimal characters in `PUSH_DEVICE_STORE_KEY`. The store is AES-256-GCM
   encrypted and created with restrictive filesystem permissions. Both settings
   must be supplied together. No database table or migration is added.
6. Rebuild/sync the Android project locally with the Firebase configuration,
   then validate against a separately authorized staging backend and test accounts.
   Nothing in this mission deploys those settings.

## Device registration and security

Each guest/account mobile session has a separate random device ID and proof.
The Android Keystore encrypts these proofs and the FCM token. Registration uses
an authenticated Android bearer request. Rotation uses a bounded WorkManager job and the existing device
proof even while an API access token needs renewal; tokens are read from the
encrypted vault and are never stored in WorkManager input data. Proofs grant only notification
verification, token maintenance, and authorized call actions; they do not grant
SDP/ICE signaling or microphone access.

The backend checks session revocation and the refresh lease before every push,
checks active account state and room membership, removes invalid provider tokens,
and excludes message senders. Token values, device proofs, room codes and provider
error text are never logged. Firebase payloads contain no message bodies/files.

The default message text is `New message on NullChannel`. Notifications expire,
group by message category, and use the same event ID for Socket.IO and FCM
suppression. Android 13+ notification permission is requested at runtime.

Incoming calls carry an ephemeral call ID and room reference. Native code verifies
the invitation before displaying it, acknowledges actual ringing, and rejects
expired/cancelled invitations. Answer uses an explicit immutable Activity
PendingIntent with a single-use Keystore-protected launch nonce; forged extras
on the exported launcher Activity cannot auto-answer. Decline uses a non-exported receiver and a session-authorized
backend request. Microphone capture starts only after user acceptance and permission.

Incoming high-priority FCM messages may start the bounded ringtone foreground
service where Android permits. This service uses `mediaPlayback`, never microphone
capture. If Android denies service startup or downgrades priority, the app retains
its ordinary notification alert. Full-screen call presentation is requested only when Android permits it; Android 14+ eligibility is checked. No background launch bypass is used. See `ANDROID_NATIVE_CALLING.md` for Telecom, permission and native Activity details. Force-stop, device power restrictions, denied notification permissions,
DND and provider delays can prevent or defer alerts.

## Deployment limits

Memory-mode device storage and call ownership belong to one backend process.
Redis coordination mode supplies a shared encrypted subscription store and distributed call state. The file store remains a single-instance option. Without an encrypted store, registrations are memory-only and
must be renewed after restart. Push is disabled by default; live Firebase delivery
and physical Android notification behavior were not tested in this mission.
