begin;
set local role service_role;
-- Simulate a live v24 guest session created before its anonymous room row
-- existed. Migration v25 must link this identity without changing its tokens.
select public.nc_mobile_session_create(
  '20000000-0000-4000-8000-000000000050', null,
  '30000000-0000-4000-8000-000000000050', repeat('8',64), repeat('9',64),
  clock_timestamp()+interval '10 minutes', clock_timestamp()+interval '30 days'
);
commit;
