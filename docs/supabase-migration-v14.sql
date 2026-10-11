-- NullChannel registered ephemeral rooms and atomic matching. Apply after v13.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.rooms add column if not exists room_kind text not null default 'guest';
alter table public.rooms add column if not exists description text not null default '';
alter table public.rooms add column if not exists category text not null default 'General';
alter table public.rooms add column if not exists tags text[] not null default '{}';
alter table public.rooms add column if not exists capacity integer not null default 20;
alter table public.rooms add constraint nc_room_kind check(room_kind in ('guest','direct','public','group','match'));
alter table public.rooms add constraint nc_room_capacity check(capacity between 2 and 50);
create index if not exists nc_public_expiry on public.rooms(expires_at) where room_kind='public';
create table public.nc_room_identities (
 room_id uuid references public.rooms(id) on delete cascade, account_id uuid references auth.users(id) on delete cascade,
 sender_id text not null unique default gen_random_uuid()::text, alias text not null,
 role text not null default 'member' check(role in ('owner','moderator','member')),
 primary key(room_id,account_id)
);
create table public.nc_presence(account_id uuid primary key references auth.users(id) on delete cascade, expires_at timestamptz not null);
create table public.nc_match_queue(account_id uuid primary key references auth.users(id) on delete cascade, deadline timestamptz not null default clock_timestamp()+interval '60 seconds');
create table public.nc_match_proposals(id uuid primary key default gen_random_uuid(), a uuid not null references auth.users(id) on delete cascade, b uuid not null references auth.users(id) on delete cascade,
 a_accept boolean not null default false,b_accept boolean not null default false, deadline timestamptz not null default clock_timestamp()+interval '15 seconds',check(a<>b));
create table public.nc_match_reservations(account_id uuid primary key references auth.users(id) on delete cascade, proposal_id uuid not null references public.nc_match_proposals(id) on delete cascade);
create table public.nc_match_exclusions(a uuid not null references auth.users(id) on delete cascade,b uuid not null references auth.users(id) on delete cascade,expires_at timestamptz not null,primary key(a,b));
create table public.nc_room_consents(room_id uuid not null references public.rooms(id) on delete cascade,account_id uuid not null references auth.users(id) on delete cascade,purpose text not null check(purpose in ('reveal','connect')),accepted boolean not null,primary key(room_id,account_id,purpose));
create table public.nc_invitations(id uuid primary key default gen_random_uuid(),sender_id uuid not null references auth.users(id) on delete cascade,recipient_id uuid not null references auth.users(id) on delete cascade,room_id uuid references public.rooms(id) on delete cascade,expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',check(sender_id<>recipient_id));
-- All identity mappings and matchmaking coordination are server-only; no browser grants.
do $$ declare t text; begin foreach t in array array['nc_room_identities','nc_presence','nc_match_queue','nc_match_proposals','nc_match_reservations','nc_match_exclusions','nc_room_consents','nc_invitations'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon, authenticated',t); execute format('grant all on public.%I to service_role',t); end loop; end $$;
create or replace function public.nc_registered_sender_valid(p_room uuid,p_sender text) returns boolean language sql security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.nc_room_identities i join auth.users u on u.id=i.account_id join public.room_members m on m.room_id=i.room_id and m.sender_id=i.sender_id where i.room_id=p_room and i.sender_id=p_sender and m.left_at is null)
$$;
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
 insert into public.room_members(room_id,sender_id,sender_name,left_at) values(r.id,i.sender_id,i.alias,null) on conflict(room_id,sender_id) do update set left_at=null;
 return jsonb_build_object('code',r.code,'roomName',r.room_name,'roomKind',r.room_kind,'expiresAt',r.expires_at,'senderId',i.sender_id,'alias',i.alias,'role',i.role);
end $$;
create or replace function public.nc_create_registered(p_account uuid,p_kind text,p_name text,p_description text,p_category text,p_tags text[],p_capacity integer,p_minutes integer,p_code text) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.rooms; sid text:=gen_random_uuid()::text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_account::text,14));
 if p_kind not in ('public','group','direct','match') or p_minutes not in (15,60,360,1440) or p_capacity not between 2 and 50 or length(p_name) not between 1 and 80 or length(p_description)>500 then raise exception 'VALIDATION_ERROR'; end if;
 if (select count(*) from public.nc_room_identities i join public.rooms owned_room on owned_room.id=i.room_id where i.account_id=p_account and i.role='owner' and owned_room.expires_at>clock_timestamp())>=3 then raise exception 'ROOM_LIMIT_REACHED'; end if;
 insert into public.rooms(code,creator_id,room_type,room_kind,room_name,description,category,tags,capacity,expires_at) values(p_code,sid,case when p_kind in ('direct','match') then 'private' else 'group' end,p_kind,p_name,p_description,p_category,p_tags,p_capacity,clock_timestamp()+make_interval(mins=>p_minutes)) returning * into r;
 insert into public.nc_room_identities(room_id,account_id,sender_id,alias,role) values(r.id,p_account,sid,'Ghost_'||substr(replace(gen_random_uuid()::text,'-',''),1,6),'owner');
 return public.nc_join_registered(p_account,r.code,true);
end $$;
create or replace function public.nc_match_sweep() returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 perform pg_advisory_xact_lock(140060);
 delete from public.nc_match_queue q where q.deadline<=clock_timestamp() or not exists(select 1 from public.nc_presence p where p.account_id=q.account_id and p.expires_at>clock_timestamp());
 delete from public.nc_match_proposals p where p.deadline<=clock_timestamp() or not exists(select 1 from public.nc_presence n where n.account_id=p.a and n.expires_at>clock_timestamp()) or not exists(select 1 from public.nc_presence n where n.account_id=p.b and n.expires_at>clock_timestamp());
 delete from public.nc_match_exclusions where expires_at<=clock_timestamp();
 delete from public.nc_invitations where expires_at<=clock_timestamp();
 delete from public.nc_presence where expires_at<=clock_timestamp();
end $$;
create or replace function public.nc_match_cancel(p_account uuid) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin perform pg_advisory_xact_lock(140060); delete from public.nc_match_queue where account_id=p_account; delete from public.nc_match_proposals where a=p_account or b=p_account; end $$;
create or replace function public.nc_match_status(p_account uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare q public.nc_match_queue; p public.nc_match_proposals; matched_code text;
begin
 perform public.nc_match_sweep();
 select * into p from public.nc_match_proposals where a=p_account or b=p_account;
 if found then return jsonb_build_object('state','proposal','proposalId',p.id,'deadline',p.deadline,'accepted',case when p.a=p_account then p.a_accept else p.b_accept end); end if;
 select * into q from public.nc_match_queue where account_id=p_account;
 if found then return jsonb_build_object('state','searching','deadline',q.deadline); end if;
 select r.code into matched_code from public.rooms r join public.nc_room_identities i on i.room_id=r.id join public.room_members m on m.room_id=i.room_id and m.sender_id=i.sender_id where i.account_id=p_account and r.room_kind='match' and r.expires_at>clock_timestamp() and m.left_at is null limit 1;
 if found then return jsonb_build_object('state','matched','code',matched_code); end if;
 return jsonb_build_object('state','idle');
end $$;
create or replace function public.nc_match_start(p_account uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare other uuid; proposal uuid; state jsonb;
begin
 perform public.nc_match_sweep();
 if not exists(select 1 from public.privacy_settings where user_id=p_account and matchmaking) then raise exception 'MATCH_DISABLED'; end if;
 if not exists(select 1 from public.nc_presence where account_id=p_account and expires_at>clock_timestamp()) then raise exception 'PRESENCE_REQUIRED'; end if;
 state:=public.nc_match_status(p_account);
 if state->>'state'<>'idle' then return state; end if;
 insert into public.nc_match_queue(account_id) values(p_account);
 select q.account_id into other from public.nc_match_queue q join public.privacy_settings s on s.user_id=q.account_id and s.matchmaking join public.nc_presence n on n.account_id=q.account_id and n.expires_at>clock_timestamp()
 where q.account_id<>p_account and q.deadline>clock_timestamp() and not exists(select 1 from public.nc_match_reservations x where x.account_id=q.account_id)
 and not exists(select 1 from public.user_blocks b where (b.blocker_id=p_account and b.blocked_id=q.account_id) or (b.blocker_id=q.account_id and b.blocked_id=p_account))
 and not exists(select 1 from public.nc_match_exclusions e where ((e.a=p_account and e.b=q.account_id) or (e.b=p_account and e.a=q.account_id)) and e.expires_at>clock_timestamp())
 order by q.deadline limit 1;
 if other is not null then
  -- Recheck both deadlines immediately before transitioning; proposals get their own 15s deadline.
  if (select count(*) from public.nc_match_queue where account_id in (p_account,other) and deadline>clock_timestamp())<>2 then return public.nc_match_status(p_account); end if;
  insert into public.nc_match_proposals(a,b) values(p_account,other) returning id into proposal;
  insert into public.nc_match_reservations(account_id,proposal_id) values(p_account,proposal),(other,proposal);
  delete from public.nc_match_queue where account_id in(p_account,other);
 end if;
 return public.nc_match_status(p_account);
end $$;
create or replace function public.nc_match_respond(p_account uuid,p_proposal uuid,p_accept boolean,p_code text) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare p public.nc_match_proposals; room jsonb;
begin
 perform public.nc_match_sweep();
 select * into p from public.nc_match_proposals where id=p_proposal for update;
 if not found or p_account not in(p.a,p.b) then raise exception 'PROPOSAL_EXPIRED'; end if;
 if not p_accept then delete from public.nc_match_proposals where id=p.id; return jsonb_build_object('state','idle'); end if;
 if exists(select 1 from public.user_blocks b where (b.blocker_id=p.a and b.blocked_id=p.b) or (b.blocker_id=p.b and b.blocked_id=p.a)) then delete from public.nc_match_proposals where id=p.id; return jsonb_build_object('state','idle'); end if;
 update public.nc_match_proposals set a_accept=a_accept or p_account=a,b_accept=b_accept or p_account=b where id=p.id returning * into p;
 if p.a_accept and p.b_accept then
  if p.deadline<=clock_timestamp() or (select count(*) from public.nc_presence where account_id in(p.a,p.b) and expires_at>clock_timestamp())<>2 then delete from public.nc_match_proposals where id=p.id; return jsonb_build_object('state','idle'); end if;
  room:=public.nc_create_registered(p.a,'match','Temporary anonymous chat','','General','{}',2,60,p_code);
  perform public.nc_join_registered(p.b,p_code,true);
  insert into public.nc_match_exclusions(a,b,expires_at) values(p.a,p.b,clock_timestamp()+interval '5 minutes') on conflict(a,b) do update set expires_at=excluded.expires_at;
  delete from public.nc_match_proposals where id=p.id;
  return jsonb_build_object('state','matched','code',p_code);
 end if;
 return public.nc_match_status(p_account);
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
 delete from public.nc_invitations where id=i.id;
 return coalesce(result,jsonb_build_object('declined',true));
end $$;
create or replace function public.nc_room_consent(p_account uuid,p_code text,p_purpose text,p_accept boolean) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.rooms; peer uuid;
begin
 select * into r from public.rooms where code=p_code for update;
 if not found or r.expires_at<=clock_timestamp() or r.room_kind<>'match' then raise exception 'ROOM_NOT_FOUND'; end if;
 if not exists(select 1 from public.nc_room_identities i join public.room_members m on m.room_id=i.room_id and m.sender_id=i.sender_id where i.room_id=r.id and i.account_id=p_account and m.left_at is null) then raise exception 'FORBIDDEN'; end if;
 if p_purpose not in ('reveal','connect') then raise exception 'VALIDATION_ERROR'; end if;
 insert into public.nc_room_consents(room_id,account_id,purpose,accepted) values(r.id,p_account,p_purpose,p_accept) on conflict(room_id,account_id,purpose) do update set accepted=excluded.accepted;
 if (select count(*) from public.nc_room_consents c join public.nc_room_identities i on i.room_id=c.room_id and i.account_id=c.account_id join public.room_members m on m.room_id=i.room_id and m.sender_id=i.sender_id where c.room_id=r.id and c.purpose=p_purpose and c.accepted and m.left_at is null)=2 then
  select account_id into peer from public.nc_room_identities where room_id=r.id and account_id<>p_account;
  if exists(select 1 from public.user_blocks b where (b.blocker_id=p_account and b.blocked_id=peer) or (b.blocker_id=peer and b.blocked_id=p_account)) then raise exception 'FORBIDDEN'; end if;
  if p_purpose='connect' then insert into public.friendships(user_low,user_high) values(least(p_account,peer),greatest(p_account,peer)) on conflict do nothing; end if;
  return jsonb_build_object('mutual',true,'connected',p_purpose='connect','profile',(select jsonb_build_object('username',username,'displayName',display_name,'avatarUrl',avatar_url) from public.profiles where id=peer));
 end if;
 return jsonb_build_object('mutual',false);
end $$;
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
 return jsonb_build_object('id',invitation.id,'expires_at',invitation.expires_at);
end $$;
do $$ declare f record; begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('nc_registered_sender_valid','nc_join_registered','nc_create_registered','nc_match_sweep','nc_match_cancel','nc_match_status','nc_match_start','nc_match_respond','nc_invitation_respond','nc_room_consent','nc_invitation_create') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); execute format('grant execute on function %s to service_role',f.signature); end loop; end $$;
notify pgrst,'reload schema';
commit;
