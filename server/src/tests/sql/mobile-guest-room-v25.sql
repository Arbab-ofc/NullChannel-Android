begin;

-- Exercise the same service-role boundary used by the backend. All writes are
-- rolled back at the end of this fixture transaction.
reset role;
do $$
begin
  if exists (select 1 from public.mobile_auth_sessions where id='20000000-0000-4000-8000-000000000050') then
    if not exists (
      select 1 from public.mobile_auth_sessions m
      join public.anonymous_sessions a on a.mobile_session_id=m.id
      where m.id='20000000-0000-4000-8000-000000000050'
        and m.identity_id='30000000-0000-4000-8000-000000000050'
    ) then raise exception 'MOBILE_GUEST_V24_BACKFILL_FAILED'; end if;
    perform public.create_room('MOBGST00', '30000000-0000-4000-8000-000000000050', 'Android guest', 'private', 'Backfilled guest', 60);
  end if;
end $$;

set local role service_role;
select public.nc_mobile_session_create(
  '20000000-0000-4000-8000-000000000051', null,
  '30000000-0000-4000-8000-000000000051', repeat('a',64), repeat('b',64),
  clock_timestamp()+interval '10 minutes', clock_timestamp()+interval '30 days'
);
reset role;

do $$
declare identity text := '30000000-0000-4000-8000-000000000051';
begin
  if not exists (
    select 1 from public.mobile_auth_sessions m
    join public.anonymous_sessions a on a.mobile_session_id=m.id
    where m.identity_id=identity::uuid and a.identity_id=identity::uuid
      and a.revoked_at is null and a.expires_at>clock_timestamp()
      and a.access_hash<>m.access_token_hash and a.refresh_hash<>m.refresh_token_hash
  ) then raise exception 'MOBILE_GUEST_ANONYMOUS_LINK_MISSING'; end if;

end $$;
set local role service_role;
select public.create_room('MOBGST01', '30000000-0000-4000-8000-000000000051', 'Android guest', 'private', 'Mobile guest test', 60);
reset role;
do $$
begin
  if not exists (select 1 from public.room_members rm where rm.sender_id='30000000-0000-4000-8000-000000000051' and rm.room_id=(select id from public.rooms where code='MOBGST01')) then
    raise exception 'MOBILE_GUEST_ROOM_CREATE_FAILED';
  end if;
end $$;

set local role service_role;
select public.nc_mobile_session_rotate(
  repeat('b',64), repeat('c',64), repeat('d',64),
  clock_timestamp()+interval '10 minutes', clock_timestamp()+interval '30 days'
);
reset role;

do $$
declare identity text := '30000000-0000-4000-8000-000000000051';
begin
  if not exists (
    select 1 from public.mobile_auth_sessions m
    join public.anonymous_sessions a on a.mobile_session_id=m.id
    where m.identity_id=identity::uuid and a.expires_at=m.refresh_expires_at
      and a.access_expires_at=m.access_expires_at and a.revoked_at is null
  ) then raise exception 'MOBILE_GUEST_REFRESH_DID_NOT_SYNC'; end if;

end $$;
set local role service_role;
select public.create_room('MOBGST02', '30000000-0000-4000-8000-000000000051', 'Android guest', 'private', 'After refresh', 60);
reset role;
do $$ begin
  if not exists (select 1 from public.rooms where code='MOBGST02') then raise exception 'MOBILE_GUEST_ROOM_AFTER_REFRESH_FAILED'; end if;
end $$;

set local role service_role;
select public.nc_mobile_session_revoke(repeat('d',64));
reset role;
do $$
begin
  if not exists (
    select 1 from public.anonymous_sessions a
    where a.mobile_session_id='20000000-0000-4000-8000-000000000051'
      and a.revoked_at is not null
  ) then raise exception 'MOBILE_GUEST_LOGOUT_DID_NOT_REVOKE_ANONYMOUS_IDENTITY'; end if;
  begin
    perform public.create_room(
      'MOBGST03', '30000000-0000-4000-8000-000000000051',
      'Android guest', 'private', 'After logout', 60
    );
    raise exception 'MOBILE_GUEST_ROOM_ALLOWED_AFTER_LOGOUT';
  exception when others then
    if sqlerrm not in ('SESSION_INVALID', 'MOBILE_GUEST_ROOM_ALLOWED_AFTER_LOGOUT') then raise; end if;
    if sqlerrm = 'MOBILE_GUEST_ROOM_ALLOWED_AFTER_LOGOUT' then raise; end if;
  end;
end $$;

set local role service_role;
select public.nc_mobile_session_create(
  '20000000-0000-4000-8000-000000000052', null,
  '30000000-0000-4000-8000-000000000052', repeat('e',64), repeat('f',64),
  clock_timestamp()-interval '1 minute', clock_timestamp()-interval '1 second'
);
reset role;
do $$
begin
  if not exists (
    select 1 from public.mobile_auth_sessions m
    join public.anonymous_sessions a on a.mobile_session_id=m.id
    where m.id='20000000-0000-4000-8000-000000000052'
      and m.revoked_at is null and a.revoked_at is null and a.expires_at <= clock_timestamp()
  ) then raise exception 'MOBILE_GUEST_EXPIRY_FIXTURE_INVALID'; end if;
  begin
    perform public.create_room(
      'MOBGST04', '30000000-0000-4000-8000-000000000052',
      'Android guest', 'private', 'Expired guest', 60
    );
    raise exception 'MOBILE_GUEST_ROOM_ALLOWED_AFTER_EXPIRY';
  exception when others then
    if sqlerrm not in ('SESSION_INVALID', 'MOBILE_GUEST_ROOM_ALLOWED_AFTER_EXPIRY') then raise; end if;
    if sqlerrm = 'MOBILE_GUEST_ROOM_ALLOWED_AFTER_EXPIRY' then raise; end if;
  end;
end $$;
set local role service_role;
select public.nc_mobile_session_rotate(
  repeat('f',64), repeat('1',64), repeat('2',64),
  clock_timestamp()+interval '10 minutes', clock_timestamp()+interval '30 days'
);
reset role;
do $$
begin
  if not exists (
    select 1 from public.mobile_auth_sessions m
    join public.anonymous_sessions a on a.mobile_session_id=m.id
    where m.id='20000000-0000-4000-8000-000000000052'
      and m.revoked_at is not null and a.revoked_at is not null
  ) then raise exception 'MOBILE_GUEST_EXPIRY_DID_NOT_REVOKE_ANONYMOUS_IDENTITY'; end if;
  begin
    perform public.create_room(
      'MOBGST04', '30000000-0000-4000-8000-000000000052',
      'Android guest', 'private', 'Expired guest', 60
    );
    raise exception 'MOBILE_GUEST_ROOM_ALLOWED_AFTER_EXPIRY';
  exception when others then
    if sqlerrm not in ('SESSION_INVALID', 'MOBILE_GUEST_ROOM_ALLOWED_AFTER_EXPIRY') then raise; end if;
    if sqlerrm = 'MOBILE_GUEST_ROOM_ALLOWED_AFTER_EXPIRY' then raise; end if;
  end;
end $$;
do $$ begin raise notice 'PASS mobile guest room v25'; end $$;
rollback;
