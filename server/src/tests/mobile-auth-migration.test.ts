import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../../../docs/supabase-migration-v24.sql', import.meta.url);
const guestMigrationUrl = new URL('../../../docs/supabase-migration-v25.sql', import.meta.url);

describe('mobile session migration safety invariants', () => {
  it('defines the RPC names and parameter names consumed by the service', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    expect(sql).toMatch(/nc_mobile_session_create\(p_id uuid,p_account_id uuid,p_identity_id uuid,p_access_hash text,p_refresh_hash text,p_access_expires_at timestamptz,p_refresh_expires_at timestamptz\)/i);
    expect(sql).toMatch(/nc_mobile_session_rotate\(p_refresh_hash text,p_access_hash text,p_next_refresh_hash text,p_access_expires_at timestamptz,p_refresh_expires_at timestamptz\)/i);
    expect(sql).toMatch(/nc_mobile_session_revoke\(p_refresh_hash text\)/i);
    expect(sql).toMatch(/'rotated','identity_id',session_row\.identity_id/i);
  });

  it('locks refresh and session rows and revokes a reused consumed token', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    expect(sql).toMatch(/from public\.mobile_auth_refresh_tokens where token_hash=p_refresh_hash for update/i);
    expect(sql).toMatch(/from public\.mobile_auth_sessions where id=token_row\.session_id for update/i);
    expect(sql).toMatch(/if token_row\.consumed_at is not null then[\s\S]*?set revoked_at=clock_timestamp\(\)/i);
    expect(sql).toMatch(/token_row\.expires_at<=clock_timestamp\(\)[\s\S]*?set revoked_at=clock_timestamp\(\)/i);
  });

  it('uses constrained definer search paths and withholds execution from browser roles', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    expect((sql.match(/security definer set search_path=pg_catalog,pg_temp/gi) ?? []).length).toBe(3);
    expect(sql).toMatch(/enable row level security/gi);
    expect(sql).toMatch(/revoke all on function[\s\S]*from public,anon,authenticated/i);
    expect(sql).toMatch(/grant execute on function[\s\S]*to service_role/i);
  });

  it('links only mobile guest sessions to the anonymous room-authorization schema', async () => {
    const sql = await readFile(guestMigrationUrl, 'utf8');
    expect(sql).toMatch(/mobile_session_id uuid\s+references public\.mobile_auth_sessions\(id\) on delete cascade/i);
    expect(sql).toMatch(/where m\.account_id is null and m\.identity_id is not null/i);
    expect(sql).toMatch(/insert into public\.anonymous_sessions[\s\S]*?p_refresh_expires_at, p_access_expires_at/i);
    expect(sql).toMatch(/on conflict \(mobile_session_id\)[\s\S]*?expires_at = excluded\.expires_at[\s\S]*?access_expires_at = excluded\.access_expires_at/i);
    expect(sql).toMatch(/update public\.anonymous_sessions[\s\S]*?where mobile_session_id = v_session_id/i);
    expect(sql).toMatch(/lock table public\.mobile_auth_sessions, public\.anonymous_sessions/i);
    expect(sql).toMatch(/MOBILE_GUEST_IDENTITY_COLLISION/);
  });
});
