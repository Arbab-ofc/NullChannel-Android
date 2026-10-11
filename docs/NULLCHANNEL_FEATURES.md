# NullChannel features and implementation status

Public identity remains **NullChannel**. The product promise is **Connect Permanently. Converse Temporarily.** Persistent accounts/friendships/settings are separated from finite room records; there is no conversation restoration feature.

The existing logo/favicon, developer attribution and dark/light theme variables are preserved. Homepage content and navigation are refined around guest and registered modes. The original `/chat/:code` route remains the conversation route.

## Implemented in source

| Area | Actual behavior |
|---|---|
| Guests | Existing anonymous session, room creation/join, messages, reactions, replies, pins, wipes, Burn Mode, attachments and private audio-call flow remain in the architecture. |
| Accounts | Signup, email/password login, refresh/logout, password recovery/update, persistent profiles, username cooldown, privacy settings, avatar upload/removal and password-confirmed deletion. |
| Social | Username search, incoming/outgoing friend requests, acceptance/rejection/cancellation, persistent friendships, removal and blocking. |
| Presence | Online/away/invisible with offline derived from leases, multi-connection tracking and visibility filtering. |
| Registered rooms | Finite public/group rooms, directory search/category/sort/pagination, atomic capacity checks and session-specific aliases. |
| Direct chats | A friend invitation creates no room until acceptance; each accepted invitation creates a fresh temporary conversation. |
| Groups | Owner/moderator/member roles, friend invitations, hashed expiring/revocable/use-limited tokens, member moderation and manual destruction. |
| Matching | Registered-only 60-second search, independent 15-second mutual proposal, block exclusions, no pre-acceptance room and fresh-room rematching. |
| Ghost interactions | Room aliases, mutual reveal, mutual Stay Connected friendship, skip and anonymous peer blocking. |
| Polls | Temporary polls, bounded options, one vote per sender, results, close authorization and expiry. |
| Notifications | Persistent expiring friend/invitation notices, unread count, mark-read/dismiss, authenticated realtime invalidation. |
| Privacy | Active sessions, active-call count, pending media cleanup state, end-my-sessions action, preferences and minimal seven-day reports. |
| Media | Private-upload request, authorized delivery proxy, durable cleanup retry, timed messages and atomic view-once policy in v18/v20. |
| Documentation | `/docs` search/navigation/copy controls, OpenAPI artifact and endpoint inventory generated from actual route sources. |

## Verification boundaries

The registered room/matching/group backend was exercised against an isolated real PostgreSQL database. Tested behavior includes capacities, single-use consumption, mutual matching/reveal/connection, exact deadline semantics, a real 60-second timeout, concurrent matching, membership moderation and cascading ephemeral deletion with persistent friendships. Registered authorization boundary tests preserve guest router pass-through.

The existing Supabase PostgreSQL schema was inspected and additive migrations v13–v22 were applied to the existing hosted project and recorded with checksums in `public.nullchannel_schema_migrations`. The schema was verified to contain 30 public tables with RLS enabled, including registered profiles/social/matching/group/media tables. The Supabase CLI remains unauthenticated; SQL used the already configured PostgreSQL URI. A controlled hosted API smoke run verified profile/privacy persistence, friend request and acceptance, offline direct-chat invitation and room creation, group invitation/poll/vote/destruction, public room discovery/join/destruction, and ending active sessions. Signup confirmation and recovery-email delivery, hosted presence/matching, and account deletion were not certified. Private ImageKit delivery returned 404 in a controlled provider probe.

Frontend source/tests do not prove every screen's visual correctness. Browser screenshots, full responsive matrix, virtual-keyboard behavior, two-device audio and assistive-technology testing must be reported separately by the final verification run.

## Limits and incomplete scope

Group audio conferencing and TURN infrastructure are absent; audio calls remain eligible private-room calls. There is no distributed multi-server presence/call coordinator. Ghost aliases are the default registered-room identity; optional identity behavior and reveal are limited to implemented controls, not every requested group/public identity policy. Custom participation rules, configurable group invite/moderation permission policy, inactivity/last-participant termination rules and group termination voting are not complete product features. Room-expiration warnings are inserted by the v22 cleanup RPC and removed when a room is destroyed; broader account-security notifications are not implemented. No permanent public communities, reusable groups or restored transcript archive are introduced.
