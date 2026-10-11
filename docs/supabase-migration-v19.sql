-- Minimal reports contain no chat evidence, messages or reusable room reference.
begin;
set local lock_timeout='5s';
create table if not exists public.nc_reports (
 id uuid primary key default gen_random_uuid(),
 reporter uuid not null references public.profiles(id) on delete cascade,
 subject uuid not null references public.profiles(id) on delete cascade,
 reason text not null check(reason in ('spam','harassment','unsafe_content','other')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '7 days',
 check(reporter<>subject)
);
create index if not exists nc_reports_expiry on public.nc_reports(expires_at);
alter table public.nc_reports enable row level security;
revoke all on public.nc_reports from anon,authenticated;
grant all on public.nc_reports to service_role;
-- Blocking immediately revokes pending invitations/proposals and direct sessions for this pair.
create or replace function public.nc_block_effects() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 delete from public.nc_invitations where (sender_id=new.blocker_id and recipient_id=new.blocked_id) or (sender_id=new.blocked_id and recipient_id=new.blocker_id);
 delete from public.nc_match_proposals where (a=new.blocker_id and b=new.blocked_id) or (b=new.blocker_id and a=new.blocked_id);
 delete from public.rooms r where r.room_kind in ('direct','match') and exists(select 1 from public.nc_room_identities i where i.room_id=r.id and i.account_id=new.blocker_id) and exists(select 1 from public.nc_room_identities i where i.room_id=r.id and i.account_id=new.blocked_id);
 return new;
end $$;
drop trigger if exists nc_block_effects on public.user_blocks;
create trigger nc_block_effects after insert on public.user_blocks for each row execute function public.nc_block_effects();
revoke all on function public.nc_block_effects() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
