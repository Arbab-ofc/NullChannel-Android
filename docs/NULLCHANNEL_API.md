# NullChannel REST API

All endpoint paths below are relative to `/api`. The inventory is extracted from actual route sources, including the social action array. `/docs`, `docs/openapi.yaml`, `client/public/openapi.yaml` and `client/public/api-reference.json` provide the generated reference. Regenerate with `npm run docs:generate`; `npm run docs:check` checks artifacts against generator output.

## Requests, authentication and responses

Browser requests use `credentials: "include"`. Account cookies are HttpOnly and server-validated. Guest cookies are independent; account-only operations reject guests even when a navigation link is hidden. Mutations require the exact configured Origin. Do not send an account UUID as authorization. Compatibility sender fields are either ignored/replaced with server-derived identities or checked against active membership.

Most successful JSON endpoints return `{success:true,data:...,error:null}`. Failures return `{success:false,data:null,error:{code,message}}`. Media/avatar delivery returns bytes with private no-store caching; health endpoints and stream/not-found behavior should be read from their controller. Creation endpoints use 201 where implemented. Relevant failures include 400 validation, 401 account/session required, 403 denied, 404 expired/missing room/media, 409 state/capacity/proposal conflict, 410 expired invitation, 413 oversized upload, 429 rate limit and sanitized 500 upstream/internal failure. Registration can return 503 `ACCOUNT_SETUP_PENDING` before hosted schema installation.

Public account entry points are signup/login/refresh/logout/forgot-password/reset-password; account profile/settings/avatar/deletion require a verified account. Registered/social/notifications/match routes are account-only. Room/media routes require a valid guest session or authorized registered-room membership. Manual `/cleanup` requires `X-Cleanup-Secret`, not an account cookie.

## Endpoint inventory

| Method | Route | Implementation |
|---|---|---|
| POST | `/account/signup` | `account.routes.ts` |
| POST | `/account/login` | `account.routes.ts` |
| POST | `/account/refresh` | `account.routes.ts` |
| POST | `/account/logout` | `account.routes.ts` |
| POST | `/account/forgot-password` | `account.routes.ts` |
| POST | `/account/reset-password` | `account.routes.ts` |
| GET | `/account/me` | `account.routes.ts` |
| PATCH | `/account/profile` | `account.routes.ts` |
| PUT | `/account/privacy` | `account.routes.ts` |
| POST | `/account/password` | `account.routes.ts` |
| POST | `/account/delete` | `account.routes.ts` |
| POST | `/account/avatar` | `account.routes.ts` |
| DELETE | `/account/avatar` | `account.routes.ts` |
| GET | `/account/avatars/:username` | `account.routes.ts` |
| POST | `/cleanup` | `cleanup.routes.ts` |
| GET | `/registered/rooms/:code/polls` | `group-tools.routes.ts` |
| POST | `/registered/rooms/:code/polls` | `group-tools.routes.ts` |
| POST | `/registered/rooms/:code/polls/:id/vote` | `group-tools.routes.ts` |
| POST | `/registered/rooms/:code/polls/:id/close` | `group-tools.routes.ts` |
| POST | `/registered/rooms/:code/moderation` | `group-tools.routes.ts` |
| POST | `/registered/rooms/:code/invite-links` | `group-tools.routes.ts` |
| POST | `/registered/invite-links/consume` | `group-tools.routes.ts` |
| POST | `/registered/rooms/:code/invite-links/:id/revoke` | `group-tools.routes.ts` |
| GET | `/health` | `health.routes.ts` |
| GET | `/health/db` | `health.routes.ts` |
| POST | `/match/start` | `match.routes.ts` |
| GET | `/match/status` | `match.routes.ts` |
| POST | `/match/cancel` | `match.routes.ts` |
| POST | `/match/proposals/:id/:action` | `match.routes.ts` |
| POST | `/match/rooms/:code/consent` | `match.routes.ts` |
| GET | `/media/files/:fileId` | `media.routes.ts` |
| POST | `/media/upload` | `media.routes.ts` |
| GET | `/notifications/unread` | `notification.routes.ts` |
| GET | `/notifications` | `notification.routes.ts` |
| PATCH | `/notifications` | `notification.routes.ts` |
| DELETE | `/notifications` | `notification.routes.ts` |
| GET | `/registered/privacy` | `privacy.routes.ts` |
| POST | `/registered/sessions/end` | `privacy.routes.ts` |
| POST | `/registered/rooms/:code/report` | `privacy.routes.ts` |
| POST | `/match/rooms/:code/block` | `privacy.routes.ts` |
| POST | `/registered/rooms` | `registered-room.routes.ts` |
| GET | `/registered/rooms` | `registered-room.routes.ts` |
| GET | `/registered/explore` | `registered-room.routes.ts` |
| POST | `/registered/rooms/:code/join` | `registered-room.routes.ts` |
| POST | `/registered/rooms/:code/terminate` | `registered-room.routes.ts` |
| GET | `/registered/invitations` | `registered-room.routes.ts` |
| POST | `/registered/invitations` | `registered-room.routes.ts` |
| POST | `/registered/invitations/:id/:action` | `registered-room.routes.ts` |
| POST | `/rooms` | `room.routes.ts` |
| GET | `/rooms/:code` | `room.routes.ts` |
| GET | `/rooms/:code/messages` | `room.routes.ts` |
| PATCH | `/rooms/:code/pin` | `room.routes.ts` |
| POST | `/rooms/:code/messages/:messageId/burn-read` | `room.routes.ts` |
| PATCH | `/rooms/:code/messages/:messageId` | `room.routes.ts` |
| POST | `/rooms/:code/messages/:messageId/reactions` | `room.routes.ts` |
| DELETE | `/rooms/:code/messages/:messageId` | `room.routes.ts` |
| GET | `/rooms/:code/participants` | `room.routes.ts` |
| POST | `/rooms/:code/extend` | `room.routes.ts` |
| POST | `/rooms/:code/wipe` | `room.routes.ts` |
| POST | `/rooms/:code/terminate` | `room.routes.ts` |
| POST | `/rooms/:code/leave` | `room.routes.ts` |
| GET | `/users/:senderId/rooms` | `room.routes.ts` |
| POST | `/session` | `session.routes.ts` |
| DELETE | `/session` | `session.routes.ts` |
| GET | `/social/friends` | `social.routes.ts` |
| GET | `/social/requests` | `social.routes.ts` |
| GET | `/social/search` | `social.routes.ts` |
| POST | `/social/requests` | `social.routes.ts` |
| POST | `/social/requests/:id/:action` | `social.routes.ts` |
| GET | `/social/blocks` | `social.routes.ts` |
| DELETE | `/social/friends/:username` | `social.routes.ts` |
| POST | `/social/blocks/:username` | `social.routes.ts` |
| DELETE | `/social/blocks/:username` | `social.routes.ts` |

## Principal request contracts

| Operation | Request fields |
|---|---|
| Signup | `username`, `email`, `password`; confirmation is checked in the UI, username uniqueness/reserved names and password policy are enforced server/database-side. |
| Login | `email`, `password`. |
| Forgot password | `email`; generic response prevents email enumeration. |
| Reset password | `password`, `accessToken`, `refreshToken` from the authorized recovery link. |
| Profile PATCH | Optional `display_name` (60 max), `bio` (240 max), `username` (3–24 characters, 30-day change cooldown). |
| Privacy PUT | Optional validated visibility/request/invitation enums and notification/matchmaking/ghost booleans matching `account.routes.ts`. |
| Password/delete | Password change: `current_password`, `password`; deletion: current `password`. |
| Avatar | Multipart `file`, one supported image at most 2 MiB. |
| Friend request | `username`; accept/reject/cancel use request ID and allowed action. |
| Registered room creation | `kind: public\|group`, `name`, optional `description`, `category`, up to five `tags`, `capacity` 2–50, `minutes` 15/60/360/1440. |
| Explore | Query `search`, `category`, `sort` (`expiry` or default creation), `page`; 20 results/page. |
| Friend invitation | `username`, optional group `code`; absence of code requests a temporary direct conversation. |
| Poll creation | `question` 1–160, `options` 2–8 strings up to 80 chars, optional `minutes` 1–1440. |
| Poll vote | `choice`, zero-based option index; first vote is idempotently retained. |
| Moderation | Temporary `senderId`, `action: mute\|unmute\|kick\|ban\|moderator\|member`, optional `minutes` 1–1440. |
| Group invite token | Creation: optional `minutes`, `uses` 1–50; consumption: 64-hex `token`; revoke by token record ID. |
| Match consent | `purpose: reveal\|connect`, `accept` boolean. |
| Report | Temporary `senderId`, `reason: spam\|harassment\|unsafe_content\|other`; no message evidence stored. |
| Notification read/dismiss | Read: `{id}` or `{all:true}`; dismiss: ID in request body or query. |
| Media upload | Multipart one `file` plus `roomCode` and `type`; membership-derived sender. Image/voice/file limits are 5/10/15 MiB. |
| View-once delivery | `GET /media/files/:fileId?open=1`; authorized opening is consumed atomically after provider retrieval/recheck. |

An example registered room request:

```js
const result = await fetch('/api/registered/rooms', {
  method: 'POST', credentials: 'include',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({kind: 'public', name: 'Study break', category: 'Study', capacity: 8, minutes: 60})
}).then(response => response.json());
// data: {code, roomName, roomKind, expiresAt, senderId, alias, role}
```

Room messages are sent through Socket.IO, not an invented POST message endpoint. See `NULLCHANNEL_SOCKET_EVENTS.md` for message/call contracts and `NULLCHANNEL_MATCHMAKING.md` for exact state/deadline responses.

## Rate limits and reference limitations

Current route limits include account 30/minute, social 45/minute, registered/match/group tools 90/minute, reports 5/minute, general authenticated API 300/minute, guest room creation 10/hour, uploads/delivery 20/hour, lookups 60/minute and manual cleanup 10/minute. Overlapping middleware applies where routes share prefixes. Per-identity mutation/management and socket/call limits are configurable in the validated server environment. Lists use bounded result counts/pagination where implemented; do not assume unlimited traversal of every entity.

The generator provides source-derived endpoint coverage and common schema/examples, but some operation bodies/responses remain generic and need manual expansion; the consistency check proves agreement with the generator, not exhaustive semantic contract equivalence. Do not treat an omitted request schema as proof that an endpoint accepts any JSON. Controllers/Zod and RPC contracts remain authoritative. No hosted API success or external provider verification is implied by this reference.
