-- Persistent avatars are independent of temporary room media. Requires v13 and v11 media_cleanup.
begin;
set local lock_timeout='5s';
alter table public.profiles add column if not exists avatar_file_id text;
alter table public.profiles add column if not exists avatar_file_path text;
create table if not exists public.profile_avatar_intents (
 id uuid primary key default gen_random_uuid(), account_id uuid references auth.users(id) on delete set null,
 file_path text not null unique,created_at timestamptz not null default now(),
 attempts integer not null default 0,next_attempt_at timestamptz not null default(now()+interval '1 hour'),lease_until timestamptz
);
alter table public.profile_avatar_intents enable row level security;
revoke all on public.profile_avatar_intents from anon,authenticated;
grant all on public.profile_avatar_intents to service_role;
create index if not exists profile_avatar_intents_due on public.profile_avatar_intents(next_attempt_at);
create or replace function public.queue_profile_avatar() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if old.avatar_file_id is not null and (tg_op='DELETE' or new.avatar_file_id is distinct from old.avatar_file_id) then
 insert into public.media_cleanup(file_id) values(old.avatar_file_id) on conflict do nothing;
 end if; return old;
end $$;
drop trigger if exists queue_profile_avatar on public.profiles;
create trigger queue_profile_avatar after update or delete on public.profiles for each row execute function public.queue_profile_avatar();
create or replace function public.commit_profile_avatar(p_account uuid,p_intent uuid,p_file_id text,p_path text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform 1 from public.profiles where id=p_account for update;
 if not found then raise exception 'ACCOUNT_UNAVAILABLE'; end if;
 if p_file_id is not null then
 perform 1 from public.profile_avatar_intents where id=p_intent and account_id=p_account and file_path=p_path for update;
 if not found then raise exception 'AVATAR_INTENT_UNAVAILABLE'; end if;
 end if;
 update public.profiles set avatar_file_id=p_file_id,avatar_file_path=p_path,avatar_url=null where id=p_account;
 if p_intent is not null then delete from public.profile_avatar_intents where id=p_intent; end if;
end $$;
create or replace function public.claim_profile_avatar_intents() returns setof public.profile_avatar_intents
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 return query update public.profile_avatar_intents set lease_until=clock_timestamp()+interval '5 minutes'
 where id in (select id from public.profile_avatar_intents where (account_id is null or next_attempt_at<=clock_timestamp()) and (lease_until is null or lease_until<=clock_timestamp()) order by created_at limit 20 for update skip locked) returning *;
end $$;
revoke all on function public.queue_profile_avatar(),public.commit_profile_avatar(uuid,uuid,text,text),public.claim_profile_avatar_intents() from public,anon,authenticated;
grant execute on function public.commit_profile_avatar(uuid,uuid,text,text),public.claim_profile_avatar_intents() to service_role;
create or replace function public.social_action(p_actor uuid,p_target uuid,p_action text,p_request uuid,p_ttl_days integer)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare req public.friend_requests; rid uuid; settings public.privacy_settings;
begin
 if p_ttl_days<1 or p_ttl_days>30 then raise exception 'INVALID_EXPIRY'; end if;
 if p_actor=p_target then raise exception 'SELF_RELATIONSHIP'; end if;
 -- Canonical advisory lock serializes every operation on this pair, including opposite-direction blocks.
 perform pg_advisory_xact_lock(hashtextextended(least(p_actor,p_target)::text||greatest(p_actor,p_target)::text,0));
 if p_action='block' then
 insert into public.user_blocks(blocker_id,blocked_id) values(p_actor,p_target) on conflict do nothing;
 delete from public.friendships where user_low=least(p_actor,p_target) and user_high=greatest(p_actor,p_target);
 delete from public.friend_requests where least(sender_id,recipient_id)=least(p_actor,p_target) and greatest(sender_id,recipient_id)=greatest(p_actor,p_target);
 return null;
 elsif p_action='unblock' then delete from public.user_blocks where blocker_id=p_actor and blocked_id=p_target; return null;
 elsif p_action='remove' then delete from public.friendships where user_low=least(p_actor,p_target) and user_high=greatest(p_actor,p_target); return null;
 end if;
 if exists(select 1 from public.user_blocks where (blocker_id=p_actor and blocked_id=p_target) or (blocker_id=p_target and blocked_id=p_actor)) then raise exception 'RELATIONSHIP_UNAVAILABLE'; end if;
 if p_action='request' then
 delete from public.friend_requests where expires_at<=clock_timestamp() and least(sender_id,recipient_id)=least(p_actor,p_target) and greatest(sender_id,recipient_id)=greatest(p_actor,p_target);
 select * into settings from public.privacy_settings where user_id=p_target;
 if settings.friend_requests='nobody' or settings.discoverability in ('nobody','friends') then raise exception 'RELATIONSHIP_UNAVAILABLE'; end if;
 if exists(select 1 from public.friendships where user_low=least(p_actor,p_target) and user_high=greatest(p_actor,p_target)) then raise exception 'ALREADY_FRIENDS'; end if;
 insert into public.friend_requests(sender_id,recipient_id,expires_at) values(p_actor,p_target,clock_timestamp()+make_interval(days=>p_ttl_days)) returning id into rid;
 if settings.notify_friend_requests then insert into public.account_notifications(user_id,type,actor_username,reference_id,expires_at) select p_target,'friend_request',username,rid,clock_timestamp()+make_interval(days=>p_ttl_days) from public.profiles where id=p_actor; end if;
 return rid;
 end if;
 select * into req from public.friend_requests where id=p_request for update;
 if not found or req.expires_at<=clock_timestamp() or least(req.sender_id,req.recipient_id)<>least(p_actor,p_target) or greatest(req.sender_id,req.recipient_id)<>greatest(p_actor,p_target) then raise exception 'REQUEST_EXPIRED'; end if;
 if p_action='cancel' and req.sender_id<>p_actor or p_action in ('accept','reject') and req.recipient_id<>p_actor then raise exception 'FORBIDDEN'; end if;
 if p_action='accept' then
 insert into public.friendships(user_low,user_high) values(least(p_actor,p_target),greatest(p_actor,p_target)) on conflict do nothing;
 if (select notify_friend_requests from public.privacy_settings where user_id=p_target) then insert into public.account_notifications(user_id,type,actor_username) select p_target,'friend_accepted',username from public.profiles where id=p_actor; end if;
 elsif p_action not in ('reject','cancel') then raise exception 'INVALID_ACTION'; end if;
 delete from public.friend_requests where id=req.id; return req.id;
end $$;
revoke all on function public.social_action(uuid,uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.social_action(uuid,uuid,text,uuid,integer) to service_role;
create or replace function public.filter_account_notification() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare prefs public.privacy_settings;
begin
 select * into prefs from public.privacy_settings where user_id=new.user_id;
 if not found then return null; end if;
 if (new.type in ('friend_request','friend_accepted') and not prefs.notify_friend_requests)
 or (new.type in ('chat_invitation','group_invitation','invitation') and not prefs.notify_invitations)
 or (new.type='match_proposal' and not prefs.notify_matches)
 or (new.type='room_expiration' and not prefs.notify_expiration) then return null; end if;
 return new;
end $$;
drop trigger if exists filter_account_notification on public.account_notifications;
create trigger filter_account_notification before insert on public.account_notifications for each row execute function public.filter_account_notification();
create or replace function public.apply_notification_preferences() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 delete from public.account_notifications where user_id=new.user_id and
 ((type in ('friend_request','friend_accepted') and not new.notify_friend_requests)
 or (type in ('chat_invitation','group_invitation','invitation') and not new.notify_invitations)
 or (type='match_proposal' and not new.notify_matches)
 or (type='room_expiration' and not new.notify_expiration));
 return new;
end $$;
drop trigger if exists apply_notification_preferences on public.privacy_settings;
create trigger apply_notification_preferences after update on public.privacy_settings for each row execute function public.apply_notification_preferences();
revoke all on function public.filter_account_notification(),public.apply_notification_preferences() from public,anon,authenticated;
commit;
