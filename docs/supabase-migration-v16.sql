-- Temporary polls, moderation and hashed invitations. Apply after v15.
begin;
set local lock_timeout='5s';set local statement_timeout='60s';
create table public.nc_room_moderation(room_id uuid not null references public.rooms(id) on delete cascade,sender_id text not null,kind text not null check(kind in ('mute','ban')),expires_at timestamptz not null,primary key(room_id,sender_id,kind));
create table public.nc_polls(id uuid primary key default gen_random_uuid(),room_id uuid not null references public.rooms(id) on delete cascade,creator_sender text not null,question text not null check(length(question) between 1 and 160),options text[] not null check(cardinality(options) between 2 and 8),expires_at timestamptz not null,closed boolean not null default false);
create table public.nc_poll_votes(poll_id uuid not null references public.nc_polls(id) on delete cascade,sender_id text not null,choice integer not null check(choice between 0 and 7),primary key(poll_id,sender_id));
create table public.nc_room_invite_tokens(id uuid primary key default gen_random_uuid(),room_id uuid not null references public.rooms(id) on delete cascade,secret_hash text unique not null check(length(secret_hash)=64),expires_at timestamptz not null,uses_remaining integer not null check(uses_remaining between 0 and 50),revoked boolean not null default false);
dO $$ declare t text; begin foreach t in array array['nc_room_moderation','nc_polls','nc_poll_votes','nc_room_invite_tokens'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
create index nc_poll_expiry on public.nc_polls(expires_at);
create index nc_invite_token_expiry on public.nc_room_invite_tokens(expires_at);
create or replace function public.nc_room_member(p_account uuid,p_code text) returns public.nc_room_identities language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare i public.nc_room_identities;
begin
 select ident.* into i from public.nc_room_identities ident join public.rooms r on r.id=ident.room_id join public.room_members m on m.room_id=ident.room_id and m.sender_id=ident.sender_id where ident.account_id=p_account and r.code=p_code and r.expires_at>clock_timestamp() and m.left_at is null;
 if not found then raise exception 'FORBIDDEN';end if;
 return i;
end $$;
create or replace function public.nc_moderate(p_account uuid,p_code text,p_sender text,p_action text,p_minutes integer default 5) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare i public.nc_room_identities;t public.nc_room_identities;r public.rooms;
begin
 select * into r from public.rooms where code=p_code for update;
 i:=public.nc_room_member(p_account,p_code);
 select * into t from public.nc_room_identities where room_id=i.room_id and sender_id=p_sender;
 if t.room_id is null or t.sender_id=i.sender_id or i.role='member' or t.role='owner' or (t.role='moderator' and i.role<>'owner') or r.room_kind not in ('group','public') then raise exception 'FORBIDDEN';end if;
 if p_action in ('mute','ban') then
 if p_minutes not between 1 and 1440 then raise exception 'VALIDATION_ERROR';end if;
 insert into public.nc_room_moderation(room_id,sender_id,kind,expires_at) values(i.room_id,p_sender,p_action,least(r.expires_at,clock_timestamp()+make_interval(mins=>p_minutes))) on conflict(room_id,sender_id,kind) do update set expires_at=excluded.expires_at;
 elsif p_action='unmute' then delete from public.nc_room_moderation where room_id=i.room_id and sender_id=p_sender and kind='mute';
 elsif p_action in ('moderator','member') then if i.role<>'owner' then raise exception 'FORBIDDEN';end if;update public.nc_room_identities set role=p_action where room_id=i.room_id and sender_id=p_sender;
 elsif p_action<>'kick' then raise exception 'VALIDATION_ERROR';end if;
 if p_action in ('kick','ban') then update public.room_members set left_at=clock_timestamp() where room_id=i.room_id and sender_id=p_sender;end if;
 return jsonb_build_object('senderId',p_sender,'action',p_action);
end $$;
create or replace function public.nc_poll_action(p_account uuid,p_code text,p_action text,p_poll uuid default null,p_question text default null,p_options text[] default null,p_choice integer default null,p_minutes integer default 15) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare i public.nc_room_identities;p public.nc_polls;r public.rooms;
begin
 select * into r from public.rooms where code=p_code for update;i:=public.nc_room_member(p_account,p_code);
 if r.room_kind not in ('public','group') then raise exception 'FORBIDDEN';end if;
 if p_action='create' then
 if length(p_question) not between 1 and 160 or cardinality(p_options) not between 2 and 8 or p_minutes not between 1 and 1440 or exists(select 1 from unnest(p_options) o where length(o) not between 1 and 80) then raise exception 'VALIDATION_ERROR';end if;
 if exists(select 1 from public.nc_room_moderation where room_id=r.id and sender_id=i.sender_id and expires_at>clock_timestamp()) then raise exception 'MUTED';end if;
 if (select count(*) from public.nc_polls where room_id=r.id and not closed and expires_at>clock_timestamp())>=5 then raise exception 'POLL_LIMIT';end if;
 insert into public.nc_polls(room_id,creator_sender,question,options,expires_at) values(r.id,i.sender_id,p_question,p_options,least(r.expires_at,clock_timestamp()+make_interval(mins=>p_minutes))) returning * into p;
 elsif p_action in ('vote','close') then
 select * into p from public.nc_polls where id=p_poll and room_id=r.id for update;
 if not found or p.closed or p.expires_at<=clock_timestamp() then raise exception 'POLL_CLOSED';end if;
 if p_action='vote' then
 if p_choice is null or p_choice<0 or p_choice>=cardinality(p.options) then raise exception 'VALIDATION_ERROR';end if;
 insert into public.nc_poll_votes(poll_id,sender_id,choice) values(p.id,i.sender_id,p_choice) on conflict do nothing;
 else
 if p.creator_sender<>i.sender_id and i.role='member' then raise exception 'FORBIDDEN';end if;
 update public.nc_polls set closed=true where id=p.id returning * into p;
 end if;
 else raise exception 'VALIDATION_ERROR';end if;
 return jsonb_build_object('id',p.id,'question',p.question,'options',p.options,'expiresAt',p.expires_at,'closed',p.closed,'results',(select coalesce(jsonb_agg(jsonb_build_object('choice',choice,'count',n)),'[]') from (select choice,count(*) n from public.nc_poll_votes where poll_id=p.id group by choice) votes));
end $$;
create or replace function public.nc_token_create(p_account uuid,p_code text,p_hash text,p_minutes integer,p_uses integer) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare i public.nc_room_identities;r public.rooms;t public.nc_room_invite_tokens;
begin
 select * into r from public.rooms where code=p_code for update;i:=public.nc_room_member(p_account,p_code);
 if i.role='member' or r.room_kind<>'group' or p_minutes not between 1 and 1440 or p_uses not between 1 and 50 or p_hash!~'^[0-9a-f]{64}$' then raise exception 'FORBIDDEN';end if;
 insert into public.nc_room_invite_tokens(room_id,secret_hash,expires_at,uses_remaining) values(r.id,p_hash,least(r.expires_at,clock_timestamp()+make_interval(mins=>p_minutes)),p_uses) returning * into t;
 return jsonb_build_object('id',t.id,'expiresAt',t.expires_at,'usesRemaining',t.uses_remaining);
end $$;
create or replace function public.nc_token_consume(p_account uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare t public.nc_room_invite_tokens;r public.rooms;result jsonb;
begin
 -- Room before token lock matches creation/revocation/destruction lock ordering.
 select room.* into r from public.rooms room join public.nc_room_invite_tokens token on token.room_id=room.id where token.secret_hash=p_hash for update of room;
 if not found or r.expires_at<=clock_timestamp() then raise exception 'INVITATION_EXPIRED';end if;
 select * into t from public.nc_room_invite_tokens where secret_hash=p_hash for update;
 if not found or t.revoked or t.expires_at<=clock_timestamp() or t.uses_remaining<=0 then raise exception 'INVITATION_EXPIRED';end if;
 if exists(select 1 from public.nc_room_identities ident join public.user_blocks b on (b.blocker_id=ident.account_id and b.blocked_id=p_account) or (b.blocked_id=ident.account_id and b.blocker_id=p_account) where ident.room_id=r.id and ident.role='owner') then raise exception 'FORBIDDEN';end if;
 result:=public.nc_join_registered(p_account,r.code,true);
 update public.nc_room_invite_tokens set uses_remaining=uses_remaining-1 where id=t.id;
 return result;
end $$;
create or replace function public.nc_token_revoke(p_account uuid,p_code text,p_token uuid) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare i public.nc_room_identities;
begin perform 1 from public.rooms where code=p_code for update;i:=public.nc_room_member(p_account,p_code);if i.role='member' then raise exception 'FORBIDDEN';end if;update public.nc_room_invite_tokens set revoked=true where id=p_token and room_id=i.room_id;end $$;
create or replace function public.nc_join_registered(p_account uuid,p_code text,p_invited boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.rooms; i public.nc_room_identities;
begin
 select * into r from public.rooms where code=p_code for update;
 if not found or r.expires_at<=clock_timestamp() or r.room_kind='guest' then raise exception 'ROOM_NOT_FOUND'; end if;
 select * into i from public.nc_room_identities where room_id=r.id and account_id=p_account;
 if i.room_id is null then
  if r.room_kind<>'public' and not p_invited then raise exception 'FORBIDDEN'; end if;
  if (select count(*) from public.room_members where room_id=r.id and left_at is null)>=r.capacity then raise exception 'ROOM_FULL'; end if;
  insert into public.nc_room_identities(room_id,account_id,alias) values(r.id,p_account,'Ghost_'||substr(replace(gen_random_uuid()::text,'-',''),1,6)) returning * into i;
 end if;
 if not exists(select 1 from public.room_members where room_id=r.id and sender_id=i.sender_id and left_at is null) and (select count(*) from public.room_members where room_id=r.id and left_at is null)>=r.capacity then raise exception 'ROOM_FULL'; end if;
 if exists(select 1 from public.nc_room_moderation where room_id=r.id and sender_id=i.sender_id and kind='ban' and expires_at>clock_timestamp()) then raise exception 'ROOM_BANNED';end if;
 insert into public.room_members(room_id,sender_id,sender_name,left_at) values(r.id,i.sender_id,i.alias,null) on conflict(room_id,sender_id) do update set left_at=null;
 return jsonb_build_object('code',r.code,'roomName',r.room_name,'roomKind',r.room_kind,'expiresAt',r.expires_at,'senderId',i.sender_id,'alias',i.alias,'role',i.role);
end $$;
create or replace function public.nc_guard_moderation() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
begin if exists(select 1 from public.nc_room_moderation where room_id=new.room_id and sender_id=new.sender_id and expires_at>clock_timestamp()) then raise exception 'MUTED';end if;return new;end $$;
create trigger guard_registered_moderation before insert on public.messages for each row execute function public.nc_guard_moderation();
do $$ declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('nc_room_member','nc_moderate','nc_poll_action','nc_token_create','nc_token_consume','nc_token_revoke','nc_guard_moderation') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
create or replace function public.nc_invitation_create(p_account uuid,p_username text,p_code text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare target uuid; rid uuid; settings public.privacy_settings; invitation public.nc_invitations;
begin
 select id into target from public.profiles where lower(username)=lower(p_username);
 if target is null or target=p_account then raise exception 'USER_UNAVAILABLE'; end if;
 if exists(select 1 from public.user_blocks where (blocker_id=p_account and blocked_id=target) or (blocker_id=target and blocked_id=p_account)) then raise exception 'USER_UNAVAILABLE'; end if;
 select * into settings from public.privacy_settings where user_id=target;
 if settings.invitations='nobody' then raise exception 'USER_UNAVAILABLE'; end if;
 if not exists(select 1 from public.friendships where user_low=least(p_account,target) and user_high=greatest(p_account,target)) then raise exception 'FRIENDSHIP_REQUIRED'; end if;
 if p_code is not null then
  select r.id into rid from public.rooms r join public.nc_room_identities i on i.room_id=r.id where r.code=p_code and r.room_kind='group' and r.expires_at>clock_timestamp() and i.account_id=p_account and i.role in ('owner','moderator') for update of r;
  if rid is null then raise exception 'FORBIDDEN'; end if;
 end if;
 if (select count(*) from public.nc_invitations where sender_id=p_account and expires_at>clock_timestamp())>=20 then raise exception 'INVITATION_LIMIT'; end if;
 insert into public.nc_invitations(sender_id,recipient_id,room_id) values(p_account,target,rid) returning * into invitation;
 insert into public.account_notifications(user_id,type,actor_username,reference_id,expires_at) values(target,case when rid is null then 'chat_invitation' else 'group_invitation' end,(select username from public.profiles where id=p_account),invitation.id,invitation.expires_at);
 return jsonb_build_object('id',invitation.id,'expires_at',invitation.expires_at);
end $$;
create or replace function public.nc_invitation_respond(p_account uuid,p_id uuid,p_accept boolean,p_code text) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare i public.nc_invitations; r public.rooms; result jsonb;
begin
 select * into i from public.nc_invitations where id=p_id for update;
 if not found or i.recipient_id<>p_account or i.expires_at<=clock_timestamp() then raise exception 'INVITATION_EXPIRED'; end if;
 if p_accept then
  if exists(select 1 from public.user_blocks b where (b.blocker_id=i.sender_id and b.blocked_id=p_account) or (b.blocker_id=p_account and b.blocked_id=i.sender_id)) then raise exception 'FORBIDDEN'; end if;
  if i.room_id is null then
   if not exists(select 1 from public.friendships where user_low=least(i.sender_id,p_account) and user_high=greatest(i.sender_id,p_account)) then raise exception 'FRIENDSHIP_REQUIRED'; end if;
   result:=public.nc_create_registered(i.sender_id,'direct','Temporary conversation','','General','{}',2,60,p_code);
   result:=public.nc_join_registered(p_account,p_code,true);
  else
   select * into r from public.rooms where id=i.room_id;
   result:=public.nc_join_registered(p_account,r.code,true);
  end if;
 end if;
 delete from public.account_notifications where user_id=p_account and reference_id=i.id and type in ('chat_invitation','group_invitation');
 delete from public.nc_invitations where id=i.id;
 return coalesce(result,jsonb_build_object('declined',true));
end $$;
create or replace function public.nc_remove_invitation_notice() returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin delete from public.account_notifications where user_id=old.recipient_id and reference_id=old.id and type in ('chat_invitation','group_invitation');return old;end $$;
create trigger nc_remove_invitation_notice after delete on public.nc_invitations for each row execute function public.nc_remove_invitation_notice();
revoke all on function public.nc_remove_invitation_notice() from public,anon,authenticated;
notify pgrst,'reload schema';commit;
