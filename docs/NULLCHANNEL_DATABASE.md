# Registered account database additions

The existing anonymous sessions, rooms, memberships, messages and media cleanup tables remain in place. Migration `supabase-migration-v13.sql` adds:

| Table | Lifetime | Purpose |
| --- | --- | --- |
| profiles | Account lifetime | Username, display name, bio, avatar reference |
| privacy_settings | Account lifetime | Discovery, presence, invitation, matching and notification choices |
| friendships | Persistent | Canonical UUID ordered relationship, unique pair |
| friend_requests | Configurable, seven days default | Pending request, canonical pair unique index |
| user_blocks | Account lifetime | Directional blocks |
| account_notifications | Seven days | Offline delivery metadata, never message bodies |

All account tables enable RLS and revoke direct anon/authenticated table privileges. Validated backend service-role requests enforce ownership and privacy. The Auth insert trigger initializes profiles and settings transactionally. The service-only `social_action` RPC serializes pair operations with an advisory transaction lock. Acceptance checks recipient ownership and database time, creates a friendship and deletes the request atomically. Blocking removes pending requests and friendships under the same pair lock. Database constraints prevent self relationships and duplicate pairs.

Friend request expiration is enforced at action time even before the social-expiry worker physically removes records. The worker removes only expired friend requests and account notifications. Shared cleanup must schedule `cleanupSocialExpiry`. Friendship records never reference a chat or message.

Forward migration sequence: existing v2–v12 prerequisites, v13 persistent account/social schema, then registered room/matching additions. v13 does not delete or modify existing guest room data. Migrations v13–v22 were applied against the inspected existing PostgreSQL schema; each version and SHA-256 is recorded in `public.nullchannel_schema_migrations`. The Supabase CLI has no access token, so the configured PostgreSQL URI was used by the local migration runner. Auth users with legacy unrelated metadata are untouched by the profile trigger.

Migration v17 adds `profiles.avatar_file_id` and `avatar_file_path`, separate `profile_avatar_intents`, transactional avatar commit and recovery claims, notification preference enforcement triggers, and a service-only five-argument social RPC. `FRIEND_REQUEST_TTL_DAYS` configures new friend-request deadlines (1–30 days, default seven). The original four-argument social RPC remains for backward compatibility; the new backend passes the configured TTL. Browser-visible own profiles omit account UUID and privacy owner ID.


## Hosted migration verification

The pre-upgrade catalog contained the v12 guest rooms/messages/media schema and its existing cleanup triggers, without a Supabase migration-history table. After v13–v22, all 30 public tables had RLS enabled. The project includes the persistent account/social tables and session-scoped room, matching, poll, moderation, invitation, media and cleanup entities. The migration runner records checksums and refuses changed already-recorded files. No database reset or broad data deletion was performed.
