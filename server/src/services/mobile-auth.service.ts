import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { supabase } from '../config/supabase.js';

export const MOBILE_ACCESS_MS = 10 * 60 * 1000;
export const MOBILE_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const token = () => randomBytes(32).toString('hex');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export type MobileCredentials = { accessToken: string; refreshToken: string; accessExpiresAt: string; refreshExpiresAt: string };
export type MobilePrincipal = { id: string; accountId: string | null; identityId: string | null };

const credentials = () => ({
  accessToken: token(),
  refreshToken: token(),
  accessExpiresAt: new Date(Date.now() + MOBILE_ACCESS_MS).toISOString(),
  refreshExpiresAt: new Date(Date.now() + MOBILE_REFRESH_MS).toISOString()
});

export async function createMobileSession(accountId: string | null = null): Promise<MobileCredentials & { identityId: string | null }> {
  const pair = credentials();
  const id = randomUUID();
  const identityId = accountId ? null : randomUUID();
  const { error } = await supabase.rpc('nc_mobile_session_create', {
    p_id: id,
    p_account_id: accountId,
    p_identity_id: identityId,
    p_access_hash: hash(pair.accessToken),
    p_refresh_hash: hash(pair.refreshToken),
    p_access_expires_at: pair.accessExpiresAt,
    p_refresh_expires_at: pair.refreshExpiresAt
  });
  if (error) throw error;
  return { ...pair, identityId };
}

export async function rotateMobileSession(refreshToken: unknown): Promise<(MobileCredentials & { identityId: string | null }) | null> {
  if (!validToken(refreshToken)) return null;
  const pair = credentials();
  const { data, error } = await supabase.rpc('nc_mobile_session_rotate', {
    p_refresh_hash: hash(refreshToken),
    p_access_hash: hash(pair.accessToken),
    p_next_refresh_hash: hash(pair.refreshToken),
    p_access_expires_at: pair.accessExpiresAt,
    p_refresh_expires_at: pair.refreshExpiresAt
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || result.status !== 'rotated') return null;
  return { ...pair, identityId: result.identity_id ?? null };
}

export async function revokeMobileSession(refreshToken: unknown): Promise<boolean> {
  if (!validToken(refreshToken)) return false;
  const { data, error } = await supabase.rpc('nc_mobile_session_revoke', { p_refresh_hash: hash(refreshToken) });
  if (error) throw error;
  return data === true || data === 'revoked';
}

export async function verifyMobileAccess(value: unknown): Promise<MobilePrincipal | null> {
  if (!validToken(value)) return null;
  const { data, error } = await supabase.from('mobile_auth_sessions')
    .select('id,account_id,identity_id')
    .eq('access_token_hash', hash(value))
    .is('revoked_at', null)
    .gt('access_expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, accountId: data.account_id, identityId: data.identity_id } : null;
}

export async function verifyMobileSession(id: unknown): Promise<MobilePrincipal | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.from('mobile_auth_sessions')
    .select('id,account_id,identity_id')
    .eq('id', id)
    .is('revoked_at', null)
    .gt('access_expires_at', new Date().toISOString())
    .gt('refresh_expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, accountId: data.account_id, identityId: data.identity_id } : null;
}

export async function mobileAccountActive(accountId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('deletion_pending').eq('id', accountId).maybeSingle();
  if (error) throw error;
  return !!data && !data.deletion_pending;
}
