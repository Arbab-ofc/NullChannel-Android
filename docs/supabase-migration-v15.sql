-- Registered/guest messaging compatibility and truthful cleanup tracking. Apply after v14.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function public.join_room(p_room uuid, p_sender text, p_name text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.rooms; n integer;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found or r.expires_at <= clock_timestamp() then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.room_kind <> 'guest' then raise exception 'ACCOUNT_REQUIRED'; end if;
  if not exists (select 1 from public.anonymous_sessions where identity_id::text = p_sender and revoked_at is null and expires_at > clock_timestamp()) then raise exception 'SESSION_INVALID'; end if;
  if not exists (select 1 from public.room_members where room_id = p_room and sender_id = p_sender and left_at is null) and r.room_type = 'private' then
    select count(*) into n from public.room_members where room_id = p_room and left_at is null;
    -- Reserve the creator's slot even if they deliberately left or are a legacy identity.
    if not exists (select 1 from public.room_members where room_id = p_room and sender_id = r.creator_id and left_at is null) and p_sender <> r.creator_id then n := n + 1; end if;
    if n >= 2 then raise exception 'ROOM_FULL'; end if;
  end if;
  insert into public.room_members(room_id, sender_id, sender_name, left_at) values (p_room, p_sender, p_name, null)
    on conflict (room_id, sender_id) do update set sender_name = excluded.sender_name, left_at = null;
end $$;
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
  if new.reply_to_message_id is not null and not exists (select 1 from public.messages where id = new.reply_to_message_id and room_id = new.room_id and not deleted) then raise exception 'INVALID_REPLY'; end if;
  if new.type <> 'text' then
    select * into u from public.media_uploads m where m.file_path = new.file_path and m.room_id = new.room_id and m.sender_id = new.sender_id and m.media_type = new.type and not m.claimed and not exists (select 1 from public.media_cleanup q where q.file_id = m.file_id) for update;
    if not found then raise exception 'INVALID_UPLOAD'; end if;
    update public.media_uploads set claimed = true where file_id = u.file_id;
    new.file_id := u.file_id; new.file_url := u.file_url; new.file_path := u.file_path;
    new.file_name := u.file_name; new.file_size := u.file_size; new.mime_type := u.mime_type;
  else
    new.file_id := null; new.file_url := null; new.file_path := null;
    new.file_name := null; new.file_size := null; new.mime_type := null;
  end if;
  new.created_at := clock_timestamp();
  return new;
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
  if not found or m.deleted or (m.burn_expires_at is not null and m.burn_expires_at <= clock_timestamp()) then raise exception 'MESSAGE_NOT_FOUND'; end if;
  if not m.burn_after_read then raise exception 'NOT_BURNABLE'; end if;
  if m.sender_id=p_sender then raise exception 'SENDER_CANNOT_BURN'; end if;
  if m.first_seen_at is null then
    seen := clock_timestamp();
    update public.messages set first_seen_at=seen, burn_expires_at=seen+interval '60 seconds' where id=m.id returning * into m;
  end if;
  return query select m.first_seen_at,m.burn_expires_at;
end $$;
create table if not exists public.nc_room_cleanup (
 id uuid primary key default gen_random_uuid(),
 accounts uuid[] not null default '{}',
 media_ids text[] not null default '{}',
 state text not null default 'cleanup_pending' check(state in ('cleanup_pending','media_cleanup_pending','cleanup_failed')),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.nc_room_cleanup enable row level security;
revoke all on public.nc_room_cleanup from anon,authenticated;
grant all on public.nc_room_cleanup to service_role;
create or replace function public.nc_track_room_cleanup() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
declare accounts uuid[]; files text[];
begin
 select coalesce(array_agg(account_id),'{}') into accounts from public.nc_room_identities where room_id=old.id;
 select coalesce(array_agg(file_id),'{}') into files from public.media_uploads where room_id=old.id;
 -- Unclaimed registered uploads must be queued before their room FK becomes NULL.
 insert into public.media_cleanup(file_id) select file_id from public.media_uploads where room_id=old.id on conflict do nothing;
 if cardinality(files)>0 then insert into public.nc_room_cleanup(accounts,media_ids,state) values(accounts,files,'media_cleanup_pending'); end if;
 return old;
end $$;
drop trigger if exists nc_track_room_cleanup on public.rooms;
create trigger nc_track_room_cleanup before delete on public.rooms for each row execute function public.nc_track_room_cleanup();
revoke all on function public.nc_track_room_cleanup() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
