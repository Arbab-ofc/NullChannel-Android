-- Durable account teardown gate. No reset, no unrelated account mutation.
begin;
set local lock_timeout='5s';
alter table public.profiles add column if not exists deletion_pending boolean not null default false;
create or replace function public.guard_registered_identity_active() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform 1 from public.profiles where id=new.account_id and not deletion_pending for share;
 if not found then raise exception 'ACCOUNT_DELETION_PENDING'; end if; return new;
end $$;
create trigger guard_registered_identity_active before insert or update on public.nc_room_identities for each row execute function public.guard_registered_identity_active();
create or replace function public.guard_registered_membership_active() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare account uuid;
begin
 if new.left_at is not null then return new; end if;
 select account_id into account from public.nc_room_identities where room_id=new.room_id and sender_id=new.sender_id;
 if account is not null then
 perform 1 from public.profiles where id=account and not deletion_pending for share;
 if not found then raise exception 'ACCOUNT_DELETION_PENDING'; end if;
 end if; return new;
end $$;
create trigger guard_registered_membership_active before insert or update on public.room_members for each row execute function public.guard_registered_membership_active();
-- Update waits for earlier membership/identity transactions holding a profile SHARE lock.
-- A subsequent room/identity creation observes the marker and rolls its complete transaction back.
create or replace function public.begin_account_deletion(p_account uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 update public.profiles set deletion_pending=true where id=p_account;
 if not found then raise exception 'ACCOUNT_UNAVAILABLE'; end if;
end $$;
create or replace function public.guard_profile_during_deletion() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if old.deletion_pending and (new.username is distinct from old.username or new.display_name is distinct from old.display_name or new.bio is distinct from old.bio or new.avatar_file_id is distinct from old.avatar_file_id or not new.deletion_pending) then raise exception 'ACCOUNT_DELETION_PENDING'; end if;
 return new;
end $$;
create trigger guard_profile_during_deletion before update on public.profiles for each row execute function public.guard_profile_during_deletion();
revoke all on function public.guard_registered_identity_active(),public.guard_registered_membership_active(),public.guard_profile_during_deletion(),public.begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.begin_account_deletion(uuid) to service_role;
commit;
