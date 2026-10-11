begin;
insert into auth.users(id,raw_user_meta_data) values('00000000-0000-0000-0000-000000000007','{"username":"fixture_burnone"}'),('00000000-0000-0000-0000-000000000008','{"username":"fixture_burntwo"}');
do $$ declare a uuid:='00000000-0000-0000-0000-000000000007';b uuid:='00000000-0000-0000-0000-000000000008'; rid uuid;sender text;reader text;mid uuid; j jsonb; receipt record;
begin
 j:=nc_create_registered(a,'public','Burn fixture','','General','{}',2,15,'TESTBRN1');sender:=j->>'senderId';
 j:=nc_join_registered(b,'TESTBRN1');reader:=j->>'senderId';select id into rid from rooms where code='TESTBRN1';
 insert into messages(room_id,sender_id,sender_name,type,content,burn_after_read) values(rid,sender,'FORGED NAME','text','temporary fixture',true) returning id into mid;
 if (select sender_name from messages where id=mid)='FORGED NAME' then raise exception 'Name spoofing';end if;
 select * into receipt from mark_message_seen(rid,mid,reader);
 if receipt.burn_expires_at<>receipt.first_seen_at+interval '60 seconds' then raise exception 'Burn deadline changed';end if;
 begin perform mark_message_seen(rid,mid,sender);raise exception 'Sender consumed burn';exception when others then if sqlerrm<>'SENDER_CANNOT_BURN' then raise;end if;end;
 -- A separate initially expired fixture preserves v20 immutable deadlines.
 insert into messages(room_id,sender_id,sender_name,type,content,burn_after_read,first_seen_at,burn_expires_at) values(rid,sender,'Ghost','text','expired fixture',true,now()-interval '61 seconds',now()-interval '1 second') returning id into mid;
 perform cleanup_burn_messages();
 if exists(select 1 from messages where id=mid) then raise exception 'Burn message retained';end if;
 raise notice 'PASS registered sender alias enforced, recipient receipt, exact60sec burn deadline, sender rejection, server cleanup';
end $$;
rollback;
