
## Authorized temporary media delivery (v18)

New uploads are private ImageKit files. Their registry marks `private_delivery=true`; browser payloads use `/api/media/files/:fileId`. The service-only authorization RPC checks live room expiry, active membership, deletion queue status, and a live claimed message whose Burn Mode deadline has not passed. Unclaimed upload previews are uploader-only. The HTTP proxy checks authorization again after bounded provider retrieval, discarding bytes if access ended during the fetch. It returns no signed URL and sends `Cache-Control: private, no-store`.

Legacy uploads remain `private_delivery=false`, preserving existing URL compatibility. Previously public provider URLs and previously downloaded copies cannot be retroactively revoked. No screenshot or downloaded-copy prevention is promised. View-once media and configurable timed-message expiry require v20 in addition to v18.

The existing durable upload-intent and provider-deletion queues remain authoritative. Provider SDK errors expose HTTP status in `$ResponseMetadata.statusCode`; the media deletion helper recognizes 404 there as idempotent completion. Versioned v18 was applied and authorization verified only in the isolated local PostgreSQL test database, not claimed as applied to hosted Supabase. Full hosted upload-to-chat integration requires hosted migration privileges and successful provider delivery.


## Timed messages and view-once media (v20)

Message sends may include `ttlSeconds` (an integer from 60 to 86400). PostgreSQL stamps `message_expires_at` from its own `created_at` and rejects later policy edits. Burn Mode keeps its separate immutable 60-second deadline after the first eligible seen receipt; whichever deadline occurs first revokes access. History, individual message lookup and quoted message hydration filter expiry. Database triggers also reject expired edits, reactions and reply references, preventing races with HTTP validation. The cleanup worker calls `cleanup_timed_messages` and broadcasts existing `message:burned` removal events; media deletion uses the same durable queue.

Media sends may include `viewOnce: true`, provided their uploaded file uses private provider delivery. Recipient thumbnail requests are denied. A recipient explicitly opens `/api/media/files/:fileId?open=1`. Authorization is checked before provider retrieval; after bounded retrieval succeeds, a PostgreSQL transaction consumes the opening under a message row lock. Only one simultaneous recipient opening succeeds. The transaction immediately queues provider deletion, and all later delivery requests are rejected. Sender previews do not consume the recipient opening; after consumption, the sender also loses delivery access. HEAD requests never consume an opening.

Opening is consumed when the server commits delivery, even if the browser subsequently loses its connection. Recovery of a consumed opening is deliberately unavailable. This prevents duplicate openings and does not prevent recipients from copying received bytes or taking screenshots. The permanent friendship remains independent of these temporary policies.

v20 was verified in the isolated local PostgreSQL database. Test fixtures with expired deadlines use only their own records and session-local privileged fixture preparation; those tests verify deadline authorization rather than claiming that a full 60-second wall-clock media session was observed. Configured ImageKit private upload and fixture deletion were verified, but signed delivery returned 404, so end-to-end hosted view-once delivery remains externally blocked.
