# NullChannel security

This document describes implemented controls and verification boundaries, not a certification or a complete independent penetration test.

## Identity and authorization

Guest sessions use random identities with hashed access/refresh secrets stored in `anonymous_sessions`. Registered access uses distinct HttpOnly cookies; production cookies use the `__Host-` prefix, Secure, SameSite=Strict and path `/`. Supabase `getUser` validates registered access tokens server-side. Refresh tokens are not placed in frontend localStorage. A localStorage event marker synchronizes logout between tabs without storing credentials.

`requireAccount` protects registered REST routes. Guest routes remain separate. Room-scoped registered sender IDs are obtained from server-only `nc_room_identities`; browser-supplied account identifiers do not grant access. Socket authentication derives ownership from cookies and revalidates credentials periodically and on sensitive room/call events. Room membership is required for messages, metadata, signaling and media. Social-only sockets cannot send room messages.

RLS is enabled and ordinary `anon`/`authenticated` table and privileged RPC grants are revoked for added application entities. Server-side service-role operations still require application authorization: a service-role key bypasses RLS and must never enter the client bundle. SQL functions use constrained search paths and transaction locks for relationships, membership, invitations, reservations and consent.

## Privacy and abuse controls

Username uniqueness is enforced by a normalized database column. Reserved names and field lengths are constrained. Profiles/search/friend lists filter blocking and visibility. Presence filters visibility and invisible status. Public profile APIs exclude emails. Ghost payloads expose transient IDs and aliases; mutual reveal is room-scoped and server-authoritative.

Blocking removes pending invitations/proposals and revokes direct/match rooms through v19 database effects. Private group/public moderation checks actor roles and target hierarchy. Mutes reject message insertion; bans reject rejoin. Reports retain only reporter, subject and an enumerated reason for seven days. They do not store message bodies, attachments or a reusable conversation reference.

Input schemas bound messages, room fields, profile fields, poll options and signaling. Uploads check membership, byte limits, supported MIME/extension and content signatures. This is format validation, not antivirus scanning or complete parser-level verification of every supported document format.

HTTP/Socket.IO limits bound authentication, social actions, room operations, reports, calls, uploads and event traffic. Origin enforcement, exact-origin credentialed CORS and Helmet supplement cookie protections. Rate limiting and presence/call registries are process-local: deployment currently requires one backend process.

## Ephemeral media and cleanup

New chat uploads request ImageKit private files and return backend media routes. The backend authorizes membership and expiration, fetches signed provider content server-side and rechecks authorization after provider latency. It does not redirect signed provider URLs to clients. v20 adds atomic view-once consumption and timed-message policies.

Provider deletion uses durable queued jobs, leases and retries. A successful database cascade is not sufficient evidence of external deletion. Cleanup state remains pending/failed until provider jobs and registered media metadata are absent. Existing public media are explicitly legacy data; already copied URLs, downloads and screenshots cannot be retroactively erased.

A controlled private ImageKit delivery probe returned HTTP 404. Consequently private upload/delivery support must be validated against the configured provider before release. Do not describe media delivery or complete hosted media erasure as verified.

## Logging, deployment and known gaps

Production logs use sanitized operational fields and request IDs, without message bodies or full credentials. Error responses sanitize internal failures and map known state errors. Keep environment files and provider/service keys out of Git. Use same-origin HTTPS and the existing loopback reverse proxy. Email recovery needs the configured Supabase redirect allowlist.

Local automated authorization/SQL tests provide evidence for implemented boundaries. Hosted SQL catalogs/RLS effects, real email signup/recovery, external media delivery/deletion, browser microphone calls and a full WCAG/security assessment remain unverified. Group voice conferencing, TURN provisioning, distributed presence and distributed rate limiting are not implemented. Cryptographic transport and temporary storage do not establish application-level end-to-end message encryption.
