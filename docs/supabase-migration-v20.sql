-- Server authoritative timed messages and one-time media opening. Requires v18/v19.
begin;
set local lock_timeout='5s';
alter table public.messages add column if not exists ttl_seconds integer;
alter table public.messages add column if not exists message_expires_at timestamptz;
alter table public.messages add column if not exists view_once boolean not null default false;
alter table public.messages add column if not exists view_consumed_at timestamptz;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.messages'::regclass and conname='messages_ttl_range')then alter table public.messages add constraint messages_ttl_range check(ttl_seconds is null or ttl_seconds between 60 and 86400);end if;end $$;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.messages'::regclass and conname='messages_ttl_deadline')then alter table public.messages add constraint messages_ttl_deadline check((ttl_seconds is null and message_expires_at is null) or (ttl_seconds is not null and message_expires_at=created_at+make_interval(secs=>ttl_seconds)));end if;end $$;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.messages'::regclass and conname='messages_view_once_media')then alter table public.messages add constraint messages_view_once_media check(not view_once or type<>'text');end if;end $$;
create index if not exists messages_timed_due on public.messages(message_expires_at) where message_expires_at is not null;
create or replace function public.guard_message_insert()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare r public.rooms; u public.media_uploads;
begin
  select * into r from public.rooms where id = new.room_id for update;
  if not found or r.expires_at <= clock_timestamp() then raise exception 'ROOM_NOT_FOUND'; end if;
  if not exists (select 1 from public.room_members where room_id = new.room_id and sender_id = new.sender_id and left_at is null) then raise exception 'JOIN_REQUIRED'; end if;
  if r.room_kind <> 'guest' then
    if not public.nc_registered_sender_valid(r.id,new.sender_id) then raise exception 'JOIN_REQUIRED'; end if;
    select alias into new.sender_name from public.nc_room_identities where room_id=r.id and sender_id=new.sender_id;
  end if;
  if new.reply_to_message_id is not null and not exists (select 1 from public.messages where id = new.reply_to_message_id and room_id = new.room_id and not deleted and (burn_expires_at is null or burn_expires_at>clock_timestamp()) and (message_expires_at is null or message_expires_at>clock_timestamp())) then raise exception 'INVALID_REPLY'; end if;
  if new.type <> 'text' then
    select * into u from public.media_uploads m where m.file_path = new.file_path and m.room_id = new.room_id and m.sender_id = new.sender_id and m.media_type = new.type and not m.claimed and not exists (select 1 from public.media_cleanup q where q.file_id = m.file_id) for update;
    if not found then raise exception 'INVALID_UPLOAD'; end if;
    if new.view_once and not u.private_delivery then raise exception 'PRIVATE_MEDIA_REQUIRED'; end if;
    update public.media_uploads set claimed = true where file_id = u.file_id;
    new.file_id := u.file_id; new.file_url := u.file_url; new.file_path := u.file_path;
    new.file_name := u.file_name; new.file_size := u.file_size; new.mime_type := u.mime_type;
  else
    new.file_id := null; new.file_url := null; new.file_path := null;
    new.file_name := null; new.file_size := null; new.mime_type := null;
  end if;
  new.created_at := clock_timestamp();
  new.message_expires_at:=case when new.ttl_seconds is not null then new.created_at+make_interval(secs=>new.ttl_seconds) else null end;
  new.view_consumed_at:=null;
  if new.type='text' and new.view_once then raise exception 'INVALID_VIEW_ONCE'; end if;
  return new;
end $$;
create or replace function public.guard_ephemeral_message_update() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if old.message_expires_at<=clock_timestamp() or old.burn_expires_at<=clock_timestamp() then raise exception 'MESSAGE_EXPIRED'; end if;
 if new.created_at is distinct from old.created_at or new.ttl_seconds is distinct from old.ttl_seconds or new.message_expires_at is distinct from old.message_expires_at or new.view_once is distinct from old.view_once or new.burn_after_read is distinct from old.burn_after_read then raise exception 'IMMUTABLE_MESSAGE_POLICY'; end if;
 if old.first_seen_at is not null and (new.first_seen_at is distinct from old.first_seen_at or new.burn_expires_at is distinct from old.burn_expires_at) then raise exception 'IMMUTABLE_BURN_DEADLINE'; end if;
 if old.view_consumed_at is not null and new.view_consumed_at is distinct from old.view_consumed_at then raise exception 'IMMUTABLE_VIEW_CONSUMPTION'; end if;
 return new;
end $$;
drop trigger if exists guard_ephemeral_message_update on public.messages;
create trigger guard_ephemeral_message_update before update on public.messages for each row execute function public.guard_ephemeral_message_update();
create or replace function public.guard_ephemeral_reaction() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare m public.messages; mid uuid;
begin
 mid:=case when tg_op='DELETE' then old.message_id else new.message_id end;
 select * into m from public.messages where id=mid for share;
 if not found and tg_op='DELETE' then return old; end if;
 if not found or m.deleted or m.message_expires_at<=clock_timestamp() or m.burn_expires_at<=clock_timestamp() then raise exception 'MESSAGE_EXPIRED'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists guard_ephemeral_reaction on public.message_reactions;
create trigger guard_ephemeral_reaction before insert or update or delete on public.message_reactions for each row execute function public.guard_ephemeral_reaction();
create or replace function public.cleanup_timed_messages() returns table(id uuid,room_id uuid)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 return query with candidate_rooms as materialized (
 select r.id from public.rooms r where exists(select 1 from public.messages m where m.room_id=r.id and m.message_expires_at<=clock_timestamp()) order by r.id limit 50 for update skip locked
 ),doomed as materialized (
 select m.id from public.messages m join candidate_rooms r on r.id=m.room_id where m.message_expires_at<=clock_timestamp() order by m.message_expires_at limit 500 for update of m skip locked
 )delete from public.messages m using doomed d where m.id=d.id returning m.id,m.room_id;
end $$;
create or replace function public.mark_message_seen(p_room uuid, p_message uuid, p_sender text)
returns table(first_seen_at timestamptz, burn_expires_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare r public.rooms; m public.messages; seen timestamptz;
begin
  select * into r from public.rooms where id=p_room for update;
  if not found or r.expires_at <= clock_timestamp() then raise exception 'ROOM_NOT_FOUND'; end if;
  -- Serialize receipt commit with session revocation/renewal as well as explicit leave.
  if r.room_kind = 'guest' then
  perform 1 from public.anonymous_sessions where identity_id::text=p_sender and revoked_at is null
    and expires_at>clock_timestamp() and access_expires_at>clock_timestamp() for share;
  if not found then raise exception 'SESSION_INVALID'; end if;
  elsif not public.nc_registered_sender_valid(r.id,p_sender) then raise exception 'SESSION_INVALID';
  end if;
  -- Hold membership stable until the receipt commits; explicit leave updates wait.
  perform 1 from public.room_members where room_id=p_room and sender_id=p_sender and left_at is null for share;
  if not found then raise exception 'JOIN_REQUIRED'; end if;
  select * into m from public.messages where id=p_message and room_id=p_room for update;
  if not found or m.deleted or m.message_expires_at<=clock_timestamp() or (m.burn_expires_at is not null and m.burn_expires_at <= clock_timestamp()) then raise exception 'MESSAGE_NOT_FOUND'; end if;
  if not m.burn_after_read then raise exception 'NOT_BURNABLE'; end if;
  if m.sender_id=p_sender then raise exception 'SENDER_CANNOT_BURN'; end if;
  if m.first_seen_at is null then
    seen := clock_timestamp();
    update public.messages set first_seen_at=seen, burn_expires_at=seen+interval '60 seconds' where id=m.id returning * into m;
  end if;
  return query select m.first_seen_at,m.burn_expires_at;
end $$;
-- Peek may authorize the sender's own preview. Recipients must explicitly request opening.
create or replace function public.authorize_media_delivery(p_file text,p_sender text,p_open boolean)
returns table(file_path text,mime_type text,file_name text,file_size integer)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u public.media_uploads;r public.rooms;m public.messages;
begin
 select * into u from public.media_uploads where file_id=p_file;
 if not found or u.room_id is null then return; end if;
 select * into r from public.rooms where id=u.room_id for share;
 if not found or r.expires_at<=clock_timestamp() then return; end if;
 perform 1 from public.room_members where room_id=r.id and sender_id=p_sender and left_at is null for share;
 if not found or exists(select 1 from public.media_cleanup where file_id=u.file_id) then return; end if;
 if u.claimed then
 select * into m from public.messages where room_id=r.id and file_id=u.file_id for share;
 if not found or m.deleted or m.burn_expires_at<=clock_timestamp() or m.message_expires_at<=clock_timestamp() or m.view_consumed_at is not null then return; end if;
 if m.view_once and p_sender<>m.sender_id and not p_open then return; end if;
 elsif u.sender_id<>p_sender then return;
 end if;
 return query select u.file_path,u.mime_type,u.file_name,u.file_size;
end $$;
create or replace function public.authorize_media_delivery(p_file text,p_sender text)
returns table(file_path text,mime_type text,file_name text,file_size integer)
language sql security definer set search_path=pg_catalog,public as $$
 select * from public.authorize_media_delivery(p_file,p_sender,false)
$$;
-- Serialize one global recipient opening after bounded provider retrieval has succeeded.
create or replace function public.consume_media_delivery(p_file text,p_sender text,p_open boolean)
returns table(file_path text,mime_type text,file_name text,file_size integer)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u public.media_uploads;m public.messages;r public.rooms;
begin
 select * into u from public.media_uploads where file_id=p_file;
 if not found or u.room_id is null then return; end if;
 select * into r from public.rooms where id=u.room_id for share;
 if not found or r.expires_at<=clock_timestamp() then return; end if;
 perform 1 from public.room_members where room_id=r.id and sender_id=p_sender and left_at is null for share;
 if not found then return; end if;
 select * into m from public.messages where room_id=u.room_id and file_id=u.file_id for update;
 if not found and not u.claimed then return query select * from public.authorize_media_delivery(p_file,p_sender,p_open);return; end if;
 if not found or m.deleted or m.burn_expires_at<=clock_timestamp() or m.message_expires_at<=clock_timestamp() or m.view_consumed_at is not null or exists(select 1 from public.media_cleanup where file_id=u.file_id) then return; end if;
 if m.view_once and m.sender_id<>p_sender then
 if not p_open then return; end if;
 update public.messages set view_consumed_at=clock_timestamp() where id=m.id;
 insert into public.media_cleanup(file_id) values(u.file_id) on conflict do nothing;
 end if;
 return query select u.file_path,u.mime_type,u.file_name,u.file_size;
end $$;
revoke all on function public.mark_message_seen(uuid,uuid,text),public.guard_ephemeral_message_update(),public.guard_ephemeral_reaction(),public.cleanup_timed_messages(),public.authorize_media_delivery(text,text,boolean),public.consume_media_delivery(text,text,boolean) from public,anon,authenticated;
grant execute on function public.mark_message_seen(uuid,uuid,text),public.cleanup_timed_messages(),public.authorize_media_delivery(text,text,boolean),public.consume_media_delivery(text,text,boolean) to service_role;
commit;
