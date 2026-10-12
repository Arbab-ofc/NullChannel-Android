-- Additive unordered-pair guards; apply to an isolated local database first.
begin;
set local lock_timeout='5s';
create table public.nc_direct_pairs(
 user_low uuid not null references auth.users(id) on delete cascade,
 user_high uuid not null references auth.users(id) on delete cascade,
 pending_id uuid references public.nc_invitations(id) on delete set null,
 active_room_id uuid references public.rooms(id) on delete set null,
 cooldown_until timestamptz,
 primary key(user_low,user_high),check(user_low<user_high)
);
create index nc_direct_pairs_high on public.nc_direct_pairs(user_high);
alter table public.nc_direct_pairs enable row level security;
revoke all on public.nc_direct_pairs from public,anon,authenticated;
grant all on public.nc_direct_pairs to service_role;
-- Preserve existing validation/notification/membership behavior under private names.
alter function public.nc_invitation_create(uuid,text,text) rename to nc_invitation_create_v23_base;
alter function public.nc_invitation_respond(uuid,uuid,boolean,text) rename to nc_invitation_respond_v23_base;
create function public.nc_direct_eligibility(p_account uuid,p_username text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare target uuid; pair public.nc_direct_pairs; active text; deadline timestamptz;
begin
 select id into target from public.profiles where normalized_username=lower(p_username);
 if target is null or target=p_account or not exists(select 1 from public.friendships where user_low=least(p_account,target) and user_high=greatest(p_account,target)) or exists(select 1 from public.user_blocks where (blocker_id=p_account and blocked_id=target) or (blocker_id=target and blocked_id=p_account)) then raise exception 'USER_UNAVAILABLE';end if;
 select * into pair from public.nc_direct_pairs where user_low=least(p_account,target) and user_high=greatest(p_account,target);
 -- Also recognize pending/active data created before this migration.
 select min(expires_at) into deadline from public.nc_invitations where room_id is null and expires_at>clock_timestamp() and least(sender_id,recipient_id)=least(p_account,target) and greatest(sender_id,recipient_id)=greatest(p_account,target);
 if deadline is not null then return jsonb_build_object('state','pending','expires_at',deadline);end if;
 select r.code,r.expires_at into active,deadline from public.rooms r
 join public.nc_room_identities a on a.room_id=r.id and a.account_id=p_account
 join public.nc_room_identities b on b.room_id=r.id and b.account_id=target
 where r.room_kind='direct' and r.expires_at>clock_timestamp() limit 1;
 if active is not null then return jsonb_build_object('state','active','code',active,'expires_at',deadline);end if;
 if pair.cooldown_until>clock_timestamp() then return jsonb_build_object('state','cooldown','retry_at',pair.cooldown_until);end if;
 return jsonb_build_object('state','available');
end $$;
create function public.nc_invitation_create(p_account uuid,p_username text,p_code text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare target uuid; eligibility jsonb; result jsonb;
begin
 if p_code is not null then return public.nc_invitation_create_v23_base(p_account,p_username,p_code);end if;
 select id into target from public.profiles where normalized_username=lower(p_username);
 if target is null or target=p_account then raise exception 'USER_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(p_account,target)::text||greatest(p_account,target)::text,23));
 insert into public.nc_direct_pairs(user_low,user_high) values(least(p_account,target),greatest(p_account,target)) on conflict do nothing;
 perform 1 from public.nc_direct_pairs where user_low=least(p_account,target) and user_high=greatest(p_account,target) for update;
 eligibility:=public.nc_direct_eligibility(p_account,p_username);
 case eligibility->>'state' when 'pending' then raise exception 'INVITATION_PENDING';when 'active' then raise exception 'ACTIVE_DIRECT_ROOM';when 'cooldown' then raise exception 'INVITATION_COOLDOWN';else null;end case;
 result:=public.nc_invitation_create_v23_base(p_account,p_username,null);
 update public.nc_direct_pairs set pending_id=(result->>'id')::uuid,active_room_id=null,cooldown_until=null where user_low=least(p_account,target) and user_high=greatest(p_account,target);
 return result;
end $$;
create function public.nc_invitation_respond(p_account uuid,p_id uuid,p_accept boolean,p_code text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare invitation public.nc_invitations; result jsonb; rid uuid;
begin
 select * into invitation from public.nc_invitations where id=p_id;
 if not found or invitation.recipient_id<>p_account or invitation.expires_at<=clock_timestamp() then raise exception 'INVITATION_EXPIRED';end if;
 if invitation.room_id is not null then return public.nc_invitation_respond_v23_base(p_account,p_id,p_accept,p_code);end if;
 perform pg_advisory_xact_lock(hashtextextended(least(invitation.sender_id,p_account)::text||greatest(invitation.sender_id,p_account)::text,23));
 insert into public.nc_direct_pairs(user_low,user_high) values(least(invitation.sender_id,p_account),greatest(invitation.sender_id,p_account)) on conflict do nothing;
 perform 1 from public.nc_direct_pairs where user_low=least(invitation.sender_id,p_account) and user_high=greatest(invitation.sender_id,p_account) for update;
 if p_accept and exists(select 1 from public.rooms r join public.nc_room_identities a on a.room_id=r.id and a.account_id=invitation.sender_id join public.nc_room_identities b on b.room_id=r.id and b.account_id=p_account where r.room_kind='direct' and r.expires_at>clock_timestamp()) then raise exception 'ACTIVE_DIRECT_ROOM';end if;
 result:=public.nc_invitation_respond_v23_base(p_account,p_id,p_accept,p_code);
 if p_accept then select id into rid from public.rooms where code=result->>'code';end if;
 update public.nc_direct_pairs set pending_id=null,active_room_id=rid,cooldown_until=case when p_accept then null else clock_timestamp()+interval '15 minutes' end where user_low=least(invitation.sender_id,p_account) and user_high=greatest(invitation.sender_id,p_account);
 return result;
end $$;
create function public.nc_direct_pairs_sweep() returns void language sql security definer set search_path=pg_catalog,pg_temp as $$
 delete from public.nc_direct_pairs p where pg_try_advisory_xact_lock(hashtextextended(p.user_low::text||p.user_high::text,23)) and coalesce(p.cooldown_until,'-infinity'::timestamptz)<=clock_timestamp()
 and not exists(select 1 from public.nc_invitations i where least(i.sender_id,i.recipient_id)=p.user_low and greatest(i.sender_id,i.recipient_id)=p.user_high and i.room_id is null and i.expires_at>clock_timestamp())
 and not exists(select 1 from public.rooms r join public.nc_room_identities a on a.room_id=r.id and a.account_id=p.user_low join public.nc_room_identities b on b.room_id=r.id and b.account_id=p.user_high where r.room_kind='direct' and r.expires_at>clock_timestamp());
$$;
revoke all on function public.nc_direct_eligibility(uuid,text),public.nc_invitation_create(uuid,text,text),public.nc_invitation_respond(uuid,uuid,boolean,text),public.nc_direct_pairs_sweep() from public,anon,authenticated;
grant execute on function public.nc_direct_eligibility(uuid,text),public.nc_invitation_create(uuid,text,text),public.nc_invitation_respond(uuid,uuid,boolean,text),public.nc_direct_pairs_sweep() to service_role;
revoke all on function public.nc_invitation_create_v23_base(uuid,text,text),public.nc_invitation_respond_v23_base(uuid,uuid,boolean,text) from service_role;
notify pgrst,'reload schema';
commit;
