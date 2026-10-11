-- Privacy-aware identity defaults and temporary expiry warnings.
begin;
set local lock_timeout='5s';
create or replace function public.nc_identity_privacy_default() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare kind text; anonymous boolean; name text;
begin
 select room_kind into kind from public.rooms where id=new.room_id;
 if kind in ('public','group') then
 select s.ghost_mode,p.username into anonymous,name from public.privacy_settings s join public.profiles p on p.id=s.user_id where s.user_id=new.account_id;
 if anonymous=false then new.alias:=name; end if;
 end if;
 return new;
end $$;
create trigger nc_identity_privacy_default before insert on public.nc_room_identities for each row execute function public.nc_identity_privacy_default();
create unique index nc_room_warning_once on public.account_notifications(user_id,reference_id) where type='room_expiration';
create or replace function public.nc_expiration_warnings() returns table(account_id uuid)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 return query with inserted as (
 insert into public.account_notifications(user_id,type,reference_id,expires_at)
 select i.account_id,'room_expiration',r.id,r.expires_at from public.rooms r
 join public.nc_room_identities i on i.room_id=r.id
 join public.room_members m on m.room_id=r.id and m.sender_id=i.sender_id and m.left_at is null
 join public.privacy_settings s on s.user_id=i.account_id and s.notify_expiration
 where r.expires_at>clock_timestamp() and r.expires_at<=clock_timestamp()+interval '2 minutes'
 on conflict(user_id,reference_id) where type='room_expiration' do nothing returning user_id
 ) select distinct user_id from inserted;
end $$;
create or replace function public.nc_remove_room_warnings() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin delete from public.account_notifications where type='room_expiration' and reference_id=old.id;return old;end $$;
create trigger nc_remove_room_warnings before delete on public.rooms for each row execute function public.nc_remove_room_warnings();
revoke all on function public.nc_identity_privacy_default(),public.nc_expiration_warnings(),public.nc_remove_room_warnings() from public,anon,authenticated;
grant execute on function public.nc_expiration_warnings() to service_role;
notify pgrst,'reload schema';
commit;
