-- New temporary media use private provider files and backend-authorized delivery.
-- Legacy media remain explicitly flagged public; existing external copies cannot be revoked.
begin;
set local lock_timeout='5s';
alter table public.media_uploads add column if not exists private_delivery boolean not null default false;
create or replace function public.authorize_media_delivery(p_file text,p_sender text)
returns table(file_path text,mime_type text,file_name text,file_size integer)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u public.media_uploads; r public.rooms;
begin
 select * into u from public.media_uploads where file_id=p_file;
 if not found or u.room_id is null then return; end if;
 select * into r from public.rooms where id=u.room_id for share;
 if not found or r.expires_at<=clock_timestamp() then return; end if;
 perform 1 from public.room_members where room_id=r.id and sender_id=p_sender and left_at is null for share;
 if not found then return; end if;
 if exists(select 1 from public.media_cleanup where file_id=u.file_id) then return; end if;
 if u.claimed then
 perform 1 from public.messages where room_id=r.id and file_id=u.file_id and not deleted and (burn_expires_at is null or burn_expires_at>clock_timestamp()) for share;
 if not found then return; end if;
 elsif u.sender_id<>p_sender then return;
 end if;
 return query select u.file_path,u.mime_type,u.file_name,u.file_size;
end $$;
revoke all on function public.authorize_media_delivery(text,text) from public,anon,authenticated;
grant execute on function public.authorize_media_delivery(text,text) to service_role;
commit;
