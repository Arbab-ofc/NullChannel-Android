begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); room uuid; result jsonb; warnings integer;
begin
 insert into auth.users(id,raw_user_meta_data) values(a,jsonb_build_object('username','qa_a_'||substr(a::text,1,8))),(b,jsonb_build_object('username','qa_b_'||substr(b::text,1,8)));
 update privacy_settings set ghost_mode=false where user_id=a;
 result:=nc_create_registered(a,'public','Scoped QA','', 'General',array[]::text[],5,15,'QAEXPIRA');
 select id into room from rooms where code='QAEXPIRA';
 if (select alias from nc_room_identities where account_id=a and room_id=room)<>(select username from profiles where id=a) then raise exception 'Opted-in identity missing';end if;
 perform nc_join_registered(b,'QAEXPIRA');
 if (select alias from nc_room_identities where account_id=b and room_id=room) not like 'Ghost_%' then raise exception 'Default anonymity lost';end if;
 update rooms set expires_at=clock_timestamp()+interval '90 seconds' where id=room;
 select count(*) into warnings from nc_expiration_warnings();
 if warnings<>2 then raise exception 'Expected two warnings';end if;
 if (select count(*) from nc_expiration_warnings())<>0 then raise exception 'Duplicate warnings';end if;
 update privacy_settings set notify_expiration=false where user_id=b;
 if exists(select 1 from account_notifications where user_id=b and type='room_expiration') then raise exception 'Preference not enforced';end if;
 delete from rooms where id=room;
 if exists(select 1 from account_notifications where reference_id=room) then raise exception 'Destroyed room warning retained';end if;
 raise notice 'PASS identity defaults and expiration warnings';
end $$;
rollback;
