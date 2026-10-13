-- Add separate opaque-token sessions for bundled Android clients.
-- Apply only after reviewing the Android backend rollout plan.
begin;
set local lock_timeout='5s';

create table public.mobile_auth_sessions(
 id uuid primary key,
 account_id uuid references auth.users(id) on delete cascade,
 identity_id uuid,
 access_token_hash text not null unique check(access_token_hash ~ '^[0-9a-f]{64}$'),
 access_expires_at timestamptz not null,
 refresh_token_hash text not null unique check(refresh_token_hash ~ '^[0-9a-f]{64}$'),
 refresh_expires_at timestamptz not null,
 revoked_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check((account_id is null and identity_id is not null) or (account_id is not null and identity_id is null))
);
create index mobile_auth_sessions_account on public.mobile_auth_sessions(account_id) where account_id is not null;
alter table public.mobile_auth_sessions enable row level security;
revoke all on public.mobile_auth_sessions from public,anon,authenticated;
grant all on public.mobile_auth_sessions to service_role;

create table public.mobile_auth_refresh_tokens(
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 session_id uuid not null references public.mobile_auth_sessions(id) on delete cascade,
 consumed_at timestamptz,
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp()
);
create index mobile_auth_refresh_session on public.mobile_auth_refresh_tokens(session_id);
create index mobile_auth_refresh_expiry on public.mobile_auth_refresh_tokens(expires_at);
alter table public.mobile_auth_refresh_tokens enable row level security;
revoke all on public.mobile_auth_refresh_tokens from public,anon,authenticated;
grant all on public.mobile_auth_refresh_tokens to service_role;

create function public.nc_mobile_session_create(p_id uuid,p_account_id uuid,p_identity_id uuid,p_access_hash text,p_refresh_hash text,p_access_expires_at timestamptz,p_refresh_expires_at timestamptz) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if (p_account_id is null)=(p_identity_id is null) then raise exception 'INVALID_PRINCIPAL';end if;
 insert into public.mobile_auth_sessions(id,account_id,identity_id,access_token_hash,access_expires_at,refresh_token_hash,refresh_expires_at)
 values(p_id,p_account_id,p_identity_id,p_access_hash,p_access_expires_at,p_refresh_hash,p_refresh_expires_at);
 insert into public.mobile_auth_refresh_tokens(token_hash,session_id,expires_at) values(p_refresh_hash,p_id,p_refresh_expires_at);
end $$;

create function public.nc_mobile_session_rotate(p_refresh_hash text,p_access_hash text,p_next_refresh_hash text,p_access_expires_at timestamptz,p_refresh_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare token_row public.mobile_auth_refresh_tokens; session_row public.mobile_auth_sessions;
begin
 select * into token_row from public.mobile_auth_refresh_tokens where token_hash=p_refresh_hash for update;
 if not found then return jsonb_build_object('status','invalid');end if;
 select * into session_row from public.mobile_auth_sessions where id=token_row.session_id for update;
 if not found then return jsonb_build_object('status','invalid');end if;
 if session_row.revoked_at is not null then return jsonb_build_object('status','revoked');end if;
 if token_row.consumed_at is not null then
   update public.mobile_auth_sessions set revoked_at=clock_timestamp(),updated_at=clock_timestamp() where id=session_row.id;
   return jsonb_build_object('status','replay');
 end if;
 if token_row.expires_at<=clock_timestamp() or session_row.refresh_expires_at<=clock_timestamp() then
   update public.mobile_auth_sessions set revoked_at=clock_timestamp(),updated_at=clock_timestamp() where id=session_row.id;
   return jsonb_build_object('status','expired');
 end if;
 update public.mobile_auth_refresh_tokens set consumed_at=clock_timestamp() where token_hash=p_refresh_hash;
 update public.mobile_auth_sessions set access_token_hash=p_access_hash,access_expires_at=p_access_expires_at,refresh_token_hash=p_next_refresh_hash,refresh_expires_at=p_refresh_expires_at,updated_at=clock_timestamp() where id=session_row.id;
 insert into public.mobile_auth_refresh_tokens(token_hash,session_id,expires_at) values(p_next_refresh_hash,session_row.id,p_refresh_expires_at);
 return jsonb_build_object('status','rotated','identity_id',session_row.identity_id);
end $$;

create function public.nc_mobile_session_revoke(p_refresh_hash text) returns text
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_session_id uuid;
begin
 select t.session_id into v_session_id from public.mobile_auth_refresh_tokens t where t.token_hash=p_refresh_hash;
 if v_session_id is null then return 'invalid';end if;
 update public.mobile_auth_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()),updated_at=clock_timestamp() where id=v_session_id;
 return 'revoked';
end $$;

revoke all on function public.nc_mobile_session_create(uuid,uuid,uuid,text,text,timestamptz,timestamptz),public.nc_mobile_session_rotate(text,text,text,timestamptz,timestamptz),public.nc_mobile_session_revoke(text) from public,anon,authenticated;
grant execute on function public.nc_mobile_session_create(uuid,uuid,uuid,text,text,timestamptz,timestamptz),public.nc_mobile_session_rotate(text,text,text,timestamptz,timestamptz),public.nc_mobile_session_revoke(text) to service_role;
notify pgrst,'reload schema';
commit;
