-- Link mobile guest credentials to the anonymous identity row required by
-- create_room/join_room. Website cookie sessions retain their existing path.
begin;
set local lock_timeout = '5s';

-- Stop session writers while linking existing mobile guests and replacing the
-- RPCs. This prevents a v24 backend request from creating an unlinked session
-- between the backfill and commit.
lock table public.mobile_auth_sessions, public.anonymous_sessions
  in share row exclusive mode;

alter table public.anonymous_sessions
  add column mobile_session_id uuid
  references public.mobile_auth_sessions(id) on delete cascade;
create unique index anonymous_sessions_mobile_session
  on public.anonymous_sessions(mobile_session_id)
  where mobile_session_id is not null;

do $$
begin
  if exists (
    select 1
    from public.mobile_auth_sessions m
    join public.anonymous_sessions a on a.identity_id = m.identity_id
    where m.account_id is null and m.identity_id is not null
      and a.mobile_session_id is distinct from m.id
  ) then
    raise exception 'MOBILE_GUEST_IDENTITY_COLLISION';
  end if;
end $$;

-- Backfill mobile guest sessions created by v24. Placeholder digests are
-- random, never returned to a client, and are distinct from mobile bearer
-- hashes so mobile credentials cannot authenticate through website cookies.
insert into public.anonymous_sessions(
  identity_id, mobile_session_id, access_hash, refresh_hash,
  expires_at, access_expires_at, revoked_at
)
select m.identity_id, m.id,
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  m.refresh_expires_at, m.access_expires_at, m.revoked_at
from public.mobile_auth_sessions m
where m.account_id is null and m.identity_id is not null
  and not exists (
    select 1 from public.anonymous_sessions a where a.identity_id = m.identity_id
  );

create or replace function public.nc_mobile_session_create(
  p_id uuid, p_account_id uuid, p_identity_id uuid, p_access_hash text,
  p_refresh_hash text, p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz
) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if (p_account_id is null) = (p_identity_id is null) then
    raise exception 'INVALID_PRINCIPAL';
  end if;
  insert into public.mobile_auth_sessions(
    id, account_id, identity_id, access_token_hash, access_expires_at,
    refresh_token_hash, refresh_expires_at
  ) values (
    p_id, p_account_id, p_identity_id, p_access_hash, p_access_expires_at,
    p_refresh_hash, p_refresh_expires_at
  );
  insert into public.mobile_auth_refresh_tokens(token_hash, session_id, expires_at)
    values (p_refresh_hash, p_id, p_refresh_expires_at);

  if p_identity_id is not null then
    insert into public.anonymous_sessions(
      identity_id, mobile_session_id, access_hash, refresh_hash,
      expires_at, access_expires_at
    ) values (
      p_identity_id, p_id,
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      p_refresh_expires_at, p_access_expires_at
    );
  end if;
end $$;

create or replace function public.nc_mobile_session_rotate(
  p_refresh_hash text, p_access_hash text, p_next_refresh_hash text,
  p_access_expires_at timestamptz, p_refresh_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare token_row public.mobile_auth_refresh_tokens;
declare session_row public.mobile_auth_sessions;
begin
  select * into token_row from public.mobile_auth_refresh_tokens
    where token_hash = p_refresh_hash for update;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  select * into session_row from public.mobile_auth_sessions
    where id = token_row.session_id for update;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if session_row.revoked_at is not null then
    return jsonb_build_object('status', 'revoked');
  end if;
  if token_row.consumed_at is not null then
    update public.mobile_auth_sessions
      set revoked_at = clock_timestamp(), updated_at = clock_timestamp()
      where id = session_row.id;
    update public.anonymous_sessions
      set revoked_at = coalesce(revoked_at, clock_timestamp())
      where mobile_session_id = session_row.id;
    return jsonb_build_object('status', 'replay');
  end if;
  if token_row.expires_at <= clock_timestamp()
      or session_row.refresh_expires_at <= clock_timestamp() then
    update public.mobile_auth_sessions
      set revoked_at = clock_timestamp(), updated_at = clock_timestamp()
      where id = session_row.id;
    update public.anonymous_sessions
      set revoked_at = coalesce(revoked_at, clock_timestamp())
      where mobile_session_id = session_row.id;
    return jsonb_build_object('status', 'expired');
  end if;

  update public.mobile_auth_refresh_tokens
    set consumed_at = clock_timestamp() where token_hash = p_refresh_hash;
  update public.mobile_auth_sessions set
    access_token_hash = p_access_hash,
    access_expires_at = p_access_expires_at,
    refresh_token_hash = p_next_refresh_hash,
    refresh_expires_at = p_refresh_expires_at,
    updated_at = clock_timestamp()
    where id = session_row.id;
  insert into public.mobile_auth_refresh_tokens(token_hash, session_id, expires_at)
    values (p_next_refresh_hash, session_row.id, p_refresh_expires_at);

  if session_row.identity_id is not null then
    insert into public.anonymous_sessions(
      identity_id, mobile_session_id, access_hash, refresh_hash,
      expires_at, access_expires_at, revoked_at
    ) values (
      session_row.identity_id, session_row.id,
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      p_refresh_expires_at, p_access_expires_at, null
    ) on conflict (mobile_session_id) where mobile_session_id is not null
      do update set expires_at = excluded.expires_at,
        access_expires_at = excluded.access_expires_at, revoked_at = null;
  end if;
  return jsonb_build_object('status', 'rotated', 'identity_id', session_row.identity_id);
end $$;

create or replace function public.nc_mobile_session_revoke(p_refresh_hash text)
returns text
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_session_id uuid;
begin
  select t.session_id into v_session_id
    from public.mobile_auth_refresh_tokens t where t.token_hash = p_refresh_hash;
  if v_session_id is null then return 'invalid'; end if;
  update public.mobile_auth_sessions
    set revoked_at = coalesce(revoked_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where id = v_session_id;
  update public.anonymous_sessions
    set revoked_at = coalesce(revoked_at, clock_timestamp())
    where mobile_session_id = v_session_id;
  return 'revoked';
end $$;

revoke all on function public.nc_mobile_session_create(uuid,uuid,uuid,text,text,timestamptz,timestamptz),
  public.nc_mobile_session_rotate(text,text,text,timestamptz,timestamptz),
  public.nc_mobile_session_revoke(text) from public, anon, authenticated;
grant execute on function public.nc_mobile_session_create(uuid,uuid,uuid,text,text,timestamptz,timestamptz),
  public.nc_mobile_session_rotate(text,text,text,timestamptz,timestamptz),
  public.nc_mobile_session_revoke(text) to service_role;
notify pgrst, 'reload schema';
commit;
