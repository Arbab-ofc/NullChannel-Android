begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000024');

set local role service_role;
select public.nc_mobile_session_create(
  '20000000-0000-4000-8000-000000000024',
  '10000000-0000-4000-8000-000000000024',
  null,
  repeat('a',64),
  repeat('b',64),
  clock_timestamp()+interval '10 minutes',
  clock_timestamp()+interval '30 days'
);
reset role;

do $$
begin
  if not has_function_privilege('service_role','public.nc_mobile_session_create(uuid,uuid,uuid,text,text,timestamptz,timestamptz)','EXECUTE')
    or not has_function_privilege('service_role','public.nc_mobile_session_rotate(text,text,text,timestamptz,timestamptz)','EXECUTE')
    or not has_function_privilege('service_role','public.nc_mobile_session_revoke(text)','EXECUTE')
    or not has_table_privilege('service_role','public.mobile_auth_sessions','SELECT')
    or not has_table_privilege('service_role','public.mobile_auth_refresh_tokens','SELECT') then
    raise exception 'service_role RPC/table grants are incomplete';
  end if;
  if (select count(*) from public.mobile_auth_sessions where id='20000000-0000-4000-8000-000000000024') <> 1 then
    raise exception 'Mobile session creation failed';
  end if;
  if (select count(*) from public.mobile_auth_refresh_tokens where session_id='20000000-0000-4000-8000-000000000024') <> 1 then
    raise exception 'Initial refresh token creation failed';
  end if;
end $$;

set local role service_role;
select public.nc_mobile_session_rotate(
  repeat('b',64), repeat('c',64), repeat('d',64),
  clock_timestamp()+interval '10 minutes', clock_timestamp()+interval '30 days'
);
reset role;

do $$
begin
  if (select access_token_hash from public.mobile_auth_sessions where id='20000000-0000-4000-8000-000000000024') <> repeat('c',64) then
    raise exception 'Rotated access token digest was not stored';
  end if;
  if (select count(*) from public.mobile_auth_refresh_tokens where session_id='20000000-0000-4000-8000-000000000024' and consumed_at is not null) <> 1 then
    raise exception 'Previous refresh token was not consumed';
  end if;
end $$;

set local role service_role;
select public.nc_mobile_session_rotate(
  repeat('b',64), repeat('e',64), repeat('f',64),
  clock_timestamp()+interval '10 minutes', clock_timestamp()+interval '30 days'
);
reset role;

do $$
begin
  if (select revoked_at from public.mobile_auth_sessions where id='20000000-0000-4000-8000-000000000024') is null then
    raise exception 'Refresh replay did not revoke the session';
  end if;
end $$;

set local role service_role;
select public.nc_mobile_session_create(
  '20000000-0000-4000-8000-000000000025',
  '10000000-0000-4000-8000-000000000024',
  null,
  repeat('1',64),
  repeat('2',64),
  clock_timestamp()+interval '10 minutes',
  clock_timestamp()+interval '30 days'
);
select public.nc_mobile_session_revoke(repeat('2',64));
reset role;

do $$
begin
  if (select revoked_at from public.mobile_auth_sessions where id='20000000-0000-4000-8000-000000000025') is null then
    raise exception 'Logout did not revoke the session';
  end if;
  raise notice 'PASS mobile auth v24 create/rotate/replay/revoke';
end $$;

rollback;
