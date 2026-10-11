-- Real wall-clock timeout test. Local isolated fixture only; rolls back.
begin;
insert into auth.users(id,raw_user_meta_data) values('00000000-0000-0000-0000-000000000003','{"username":"fixture_timeout"}');
insert into public.nc_presence values('00000000-0000-0000-0000-000000000003',clock_timestamp()+interval '90 seconds');
select public.nc_match_start('00000000-0000-0000-0000-000000000003');
do $$ declare duration numeric; begin
 select extract(epoch from deadline-clock_timestamp()) into duration from public.nc_match_queue where account_id='00000000-0000-0000-0000-000000000003';
 if duration<59.9 or duration>60 then raise exception 'Not an exact server-recorded 60 second deadline'; end if;
end $$;
select pg_sleep(60);
do $$ begin
 if public.nc_match_status('00000000-0000-0000-0000-000000000003')->>'state'<>'idle' then raise exception 'Search active after 60 seconds'; end if;
 if exists(select 1 from public.nc_match_queue where account_id='00000000-0000-0000-0000-000000000003') then raise exception 'Queue not removed'; end if;
 if exists(select 1 from public.nc_room_identities where account_id='00000000-0000-0000-0000-000000000003') then raise exception 'Room exists'; end if;
 raise notice 'PASS actual 60 second wall-clock deadline, queue deletion, no room';
end $$;
rollback;
