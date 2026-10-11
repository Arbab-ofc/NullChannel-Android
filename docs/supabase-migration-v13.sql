-- Registered accounts coexist with the existing anonymous session schema.
begin;
set local lock_timeout = '5s';
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null, normalized_username text generated always as (lower(username)) stored unique,
 display_name text not null default '', bio text not null default '', avatar_url text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), username_changed_at timestamptz,
 constraint profile_username check (username ~ '^[A-Za-z0-9_]{3,24}$' and lower(username) not in ('admin','administrator','nullchannel','support','system','moderator','api','root')),
 constraint profile_lengths check (length(display_name)<=60 and length(bio)<=240)
);
create table if not exists public.privacy_settings (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 profile_visibility text not null default 'registered' check(profile_visibility in ('registered','friends','private')),
 discoverability text not null default 'registered' check(discoverability in ('registered','friends','nobody')),
 friend_requests text not null default 'registered' check(friend_requests in ('registered','nobody')),
 presence_visibility text not null default 'friends' check(presence_visibility in ('registered','friends','nobody')),
 invitations text not null default 'friends' check(invitations in ('registered','friends','nobody')),
 matchmaking boolean not null default true, ghost_mode boolean not null default true,
 notify_friend_requests boolean not null default true, notify_invitations boolean not null default true,
 notify_matches boolean not null default true, notify_expiration boolean not null default true
);
create table if not exists public.friendships (
 user_low uuid not null references public.profiles(id) on delete cascade,
 user_high uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_low,user_high), check(user_low<user_high)
);
create index if not exists friendships_high on public.friendships(user_high);
create table if not exists public.friend_requests (
 id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '7 days'),
 check(sender_id<>recipient_id), check(expires_at>created_at)
);
create unique index if not exists friend_requests_pair on public.friend_requests(least(sender_id,recipient_id),greatest(sender_id,recipient_id));
create index if not exists friend_requests_expiry on public.friend_requests(expires_at);
create table if not exists public.user_blocks (
 blocker_id uuid not null references public.profiles(id) on delete cascade,
 blocked_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);
create table if not exists public.account_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 type text not null, actor_username text, reference_id uuid, read_at timestamptz,
 created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '7 days')
);
create index if not exists account_notifications_owner on public.account_notifications(user_id,created_at desc);
create or replace function public.initialize_account_profile() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.raw_user_meta_data->>'username' is not null then
 insert into public.profiles(id,username,display_name) values(new.id,new.raw_user_meta_data->>'username',new.raw_user_meta_data->>'username');
 insert into public.privacy_settings(user_id) values(new.id);
 end if; return new;
end $$;
drop trigger if exists initialize_account_profile on auth.users;
create trigger initialize_account_profile after insert on auth.users for each row execute function public.initialize_account_profile();
create or replace function public.social_action(p_actor uuid,p_target uuid,p_action text,p_request uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare req public.friend_requests; rid uuid; settings public.privacy_settings;
begin
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
 insert into public.friend_requests(sender_id,recipient_id) values(p_actor,p_target) returning id into rid;
 if settings.notify_friend_requests then insert into public.account_notifications(user_id,type,actor_username,reference_id) select p_target,'friend_request',username,rid from public.profiles where id=p_actor; end if;
 return rid;
 end if;
 select * into req from public.friend_requests where id=p_request for update;
 if not found or req.expires_at<=clock_timestamp() or least(req.sender_id,req.recipient_id)<>least(p_actor,p_target) or greatest(req.sender_id,req.recipient_id)<>greatest(p_actor,p_target) then raise exception 'REQUEST_EXPIRED'; end if;
 if p_action='cancel' and req.sender_id<>p_actor or p_action in ('accept','reject') and req.recipient_id<>p_actor then raise exception 'FORBIDDEN'; end if;
 if p_action='accept' then
 insert into public.friendships(user_low,user_high) values(least(p_actor,p_target),greatest(p_actor,p_target)) on conflict do nothing;
 insert into public.account_notifications(user_id,type,actor_username) select p_target,'friend_accepted',username from public.profiles where id=p_actor;
 elsif p_action not in ('reject','cancel') then raise exception 'INVALID_ACTION'; end if;
 delete from public.friend_requests where id=req.id; return req.id;
end $$;
create or replace function public.guard_profile_update() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.username is distinct from old.username then
 if old.username_changed_at is not null and old.username_changed_at>clock_timestamp()-interval '30 days' then raise exception 'USERNAME_COOLDOWN'; end if;
 new.username_changed_at:=clock_timestamp();
 end if; new.updated_at:=clock_timestamp(); return new;
end $$;
drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update before update on public.profiles for each row execute function public.guard_profile_update();
-- Direct browser database access is forbidden. Only validated server account requests use these tables.
do $$ declare t text; begin
 foreach t in array array['profiles','privacy_settings','friendships','friend_requests','user_blocks','account_notifications'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
revoke all on function public.social_action(uuid,uuid,text,uuid),public.initialize_account_profile() from public,anon,authenticated;
grant execute on function public.social_action(uuid,uuid,text,uuid) to service_role;
commit;
