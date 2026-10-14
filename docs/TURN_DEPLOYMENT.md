# TURN deployment plan

The application now requests ICE servers from the authenticated endpoint
`GET /api/rooms/:code/calls/ice-servers`. The endpoint returns a short-lived,
HMAC-SHA1 coturn REST credential only to an authenticated member of an active
private room. If TURN is not configured, it returns an empty relay list; the
client retains its public STUN and host-candidate paths. No coturn service is
installed, started, or deployed by this repository change.

## Backend settings

Set these on the backend only after coturn is deployed:

```dotenv
TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp
TURN_SHARED_SECRET=<same random secret configured as coturn static-auth-secret>
TURN_CREDENTIAL_TTL_SECONDS=3600
```

`TURN_URLS` and `TURN_SHARED_SECRET` must be set together. Use a unique random
secret of at least 32 characters. Do not put it in Vite configuration, an APK,
or client logs. The default credential lifetime is one hour and accepted
values are 60 to 86400 seconds.

## VPS requirements for the operator

Choose a publicly reachable static IP or hostname such as
`turn.example.com`; publish an A/AAAA record separately when approved. Allow
coturn to listen on UDP and TCP port 3478, TLS/TCP port 5349 when TLS is used,
and a bounded UDP relay range such as 49160–49200. Open the same relay range
for UDP on the VPS firewall and any upstream firewall/NAT. Ensure the VPS has
sufficient public bandwidth: relayed audio flows through the VPS in both
directions for the entire call, so aggregate relay traffic grows with call
minutes and concurrent calls.

Example coturn settings (review for the chosen operating system and network;
these are a deployment guide, not commands executed by this change):

```ini
listening-port=3478
tls-listening-port=5349
min-port=49160
max-port=49200
fingerprint
use-auth-secret
static-auth-secret=<same value as TURN_SHARED_SECRET>
realm=turn.example.com
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
no-cli
no-multicast-peers
```

Use `use-auth-secret` for the timestamped HMAC credentials returned by this backend;
do not also select static-user `lt-cred-mech` authentication or configure `user=`
accounts. Coturn enables the underlying long-term mechanism internally. See the
[official configuration example](https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf).

The installed coturn version has not been inspected on a live server. Verify the
example against that version's packaged configuration/man page before activation.
Modern coturn denies loopback peers by default: leave `allow-loopback-peers` disabled.
Older versions may expose `no-loopback-peers`; use that option only if supported by
the installed version. Do not blindly copy obsolete options into a current server.

The TLS certificate must be valid for the TURN hostname and readable by coturn.
Configure coturn to bind the correct public/private interface addresses if the
host is behind NAT. Restrict peer destinations as appropriate to prevent relay
abuse, and monitor allocation count, bandwidth, authentication failures, and
expiry. Keep the static secret synchronized with the backend environment.

## Native Android credential recovery

Each native call caches its authenticated ICE response until 30 seconds before
expiration. Concurrent requests share one refresh. Initial capture, caller restarts
and receiver offers use the same call-scoped lease. Before answering an offer, the
receiver fetches fresh credentials when necessary and applies ICE configuration to
the existing peer before setting the remote description/creating its answer. Audio
tracks and microphone ownership are preserved. Public STUN remains alongside TURN.

Refresh runs outside the signaling owner thread. Hangup closes the lease; late results
cannot configure media or answer for an ended/replaced owner. Native HTTP timeouts
bound an already-running request even when cancellation cannot interrupt the socket.
A receiver refresh/configuration failure ends the call safely instead of answering
with expired credentials. Successful SDP processing retains revision and receipt rules.
Automated tests use synthetic credentials and media; no live relay allocation or
physical-device interoperability is implied.

Local regression validation for this fix: six ICE lease tests cover expiration,
concurrent refresh deduplication, failed refresh/retry, cancellation, STUN/TURN
coexistence and invalid expiration. Five receiver Socket.IO regression tests cover
configuration ordering, revision/receipt preservation, duplicate recovery offers,
refresh/configuration failures and cancellation followed by a replacement owner.
Android unit tests: 44 passed. Android lint and debug assembly passed (zero lint
errors, 34 warnings). Backend/frontend tests passed: 216/232; 61 backend tests
requiring opt-in database/browser infrastructure remained skipped. ESLint,
TypeScript checks and `git diff --check` passed. No live coturn/provider/device
verification was performed.

After deployment, verify UDP, TCP, and TLS allocations from representative
networks, then verify a two-device call with `iceTransportPolicy: all` and
confirm a `relay` candidate pair in browser WebRTC diagnostics. VPNs and
firewalls that block all configured TURN transports can still prevent calls.

## Capacity and operator-only preparation

The example relay range has 41 ports and is only an example for a small pilot.
Choose the range from expected simultaneous allocations, including temporary ICE
restart overlap, then verify allocation limits under load. Do not copy an
undersized range into a production configuration.

For planning only, if an audio stream including overhead uses 40–100 kbit/s in each
direction, a relay accounts for roughly 1.2–3 MB per connected minute when both
incoming and outgoing traffic are counted. This is arithmetic from an assumed
bitrate, not a measurement; actual Opus bitrate, packet overhead, provider billing
and retransmission change the result. Measure the selected deployment.

Example preparation commands for an operator on a reviewed Debian/Ubuntu host
(**not executed by this mission**, and not suitable for an unreviewed OS):

```sh
sudo apt-get update
sudo apt-get install coturn
openssl rand -hex 32
```

Installing the package may start a service. Review the installation procedure,
package defaults, service identity, interface/NAT mapping and maintenance window
before executing it. Place the generated secret in an operator-managed coturn
configuration and backend secret store; never paste it into repository examples.
Certificate provisioning, firewall/DNS changes and service activation require the
operator's separate deployment authorization. A staging relay allocation test
must verify temporary authentication, credential expiry, UDP/TCP/TLS, allowed peer
destinations and selected `relay` candidates before any production rollout.
