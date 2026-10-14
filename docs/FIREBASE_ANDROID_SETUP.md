# Firebase setup for NullChannel Android

The existing project is `nullchannel-b2fa5`, with Android package
`com.nullchannel.android`. Android client configuration has already been copied to
ignored `android/app/google-services.json`; the APK's generated Firebase resources
were verified. An operator-supplied Admin credential is now configured locally.
No new project/key was created and no production settings were changed.
Backend push remains disabled by default in source (`PUSH_ENABLED=false`).

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


## Local Admin configuration

The existing operator-supplied service account was validated for project
`nullchannel-b2fa5` and copied without changing the Downloads original to:

`~/.config/nullchannel/credentials/firebase-admin.json`

The containing application/credential directories have mode `700`; the credential
has mode `600` and is outside the repository. Do not move it into Android assets,
frontend source, backend source, dist/build output or Git. The Android client JSON
is not an Admin credential and cannot replace this server identity.

The backend uses `dotenv.config()` relative to its runtime working directory.
Root npm workspace commands run the backend in `server/`; this setup uses ignored,
mode-`600` `server/.env`, with no conflicting root `.env`. Start backend commands
from that workspace. Shell/service-manager environment values take precedence.
This file is local setup, not a production environment template to deploy verbatim.

Configured local fields (secret value intentionally omitted):

```dotenv
PUSH_ENABLED=true
FIREBASE_PROJECT_ID=nullchannel-b2fa5
GOOGLE_APPLICATION_CREDENTIALS=/Users/arbabarshad/.config/nullchannel/credentials/firebase-admin.json
CALL_COORDINATION_MODE=memory
PUSH_DEVICE_STORE_PATH=/Users/arbabarshad/.config/nullchannel/data/push-devices.enc
# PUSH_DEVICE_STORE_KEY is generated securely and stored only in the ignored .env.
```

A cryptographically random 32-byte AES key, represented as 64 lowercase hexadecimal
characters, was generated locally. Preserve that key across restarts; replacing it
makes the existing registration store unreadable. The data directory is mode `700`
and the AES-256-GCM store is mode `600`. An empty encrypted store was created and
validated without registering any device or accessing Supabase.

No pre-existing root/server `.env` was present. Other mandatory application settings
(`CLIENT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IMAGEKIT_PUBLIC_KEY`,
`IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`) still need authorized local development
values before running the entire backend. Do not substitute production credentials
for tests. The server was not started by this setup.

## Initialization and safe verification

Push uses a lazily initialized, named `nullchannel-push` Firebase Admin app with
Application Default Credentials. It does not reuse an unrelated default app or a
named app for a different project. Enabled push requires a valid explicit project
ID. Initialization/delivery failures report constant sanitized diagnostic operations;
SDK exception text, tokens, credential paths and payload contents are not logged.
FCM data uses an explicit field allowlist to exclude accidental message/secret fields.

Local validation: root ESLint and TypeScript checks passed; backend production build
passed; backend tests finished with 227 passed and 61 skipped. An initial parallel
run hit the existing manual harness shutdown assertion; its isolated run and the
subsequent full run passed. Frontend source and Android source/configuration were
unchanged, so frontend tests and APK rebuild were not repeated for this Admin task.
Security checks found no supplied private-key material in tracked files, compiled
backend output or the existing APK. Credentials/local environment remain untracked;
legitimate source/documentation changes are intentionally left uncommitted.

A standalone check using the actual Firebase Admin SDK initialized ADC from the
protected credential and successfully obtained an OAuth access token. The token was
not printed or persisted. No message, user, IAM change or Firebase resource write
was performed. This proves credential acceptance, **not** FCM send permission,
registration-token validity or device delivery.

Automated tests use mocked FCM, synthetic authorization fixtures and temporary
encrypted files. They cover lazy initialization, missing credentials, project
validation, registration/rotation/revocation, persistence, recipient authorization,
expiry, duplicate-token suppression and safe transport failures.

## One-process rollout requirements

Use one Node process with `CALL_COORDINATION_MODE=memory`; Redis is unnecessary for
FCM or Socket.IO in this mode. Persist device registrations in the protected file
with a stable encryption key. Active calls remain in memory and end when the backend
process restarts. No new database migration is added by Admin configuration; existing
mobile-auth schema prerequisites still apply.

Before a separately authorized production rollout:

1. Validate local/staging backend configuration and existing browser/mobile flows.
2. Supply an operator-managed Admin identity authorized to send FCM messages, matching
   the Android project. FCM HTTP v1 is reported enabled by the operator; no project
   settings were inspected or changed here.
3. Provision a private writable registration-store path and stable secret through the
   production secret-management procedure. Do not copy this local .env automatically.
4. Test real Android token registration, notification permission/channels, message and
   incoming/cancelled call delivery only after explicit authorization to send pushes.
5. Verify lock-screen/background/OEM behavior, logout and expired-session rejection.
   Logout deletion is best effort; revoked sessions are also filtered and stale rows
   removed during authorization/delivery validation. Push delivery is best effort,
   with per-batch token and client event-ID deduplication, not an exactly-once guarantee.
6. Obtain separate deployment/restart approval. No deployment or service restart is
   part of this task.
