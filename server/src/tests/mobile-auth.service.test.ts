import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from, query } = vi.hoisted(() => {
  const query = { filters: [] as Array<[string, unknown[]]>, data: null as unknown, error: null as unknown };
  const rpc = vi.fn();
  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'gt']) {
      chain[method] = (...args: unknown[]) => { query.filters.push([method,args]); return chain; };
    }
    chain.maybeSingle = async () => ({ data: query.data, error: query.error });
    return chain;
  });
  return { rpc, from, query };
});

vi.mock('../config/supabase.js', () => ({ supabase: { rpc, from } }));
import { createMobileSession, MOBILE_ACCESS_MS, MOBILE_REFRESH_MS, rotateMobileSession, verifyMobileAccess, verifyMobileSession } from '../services/mobile-auth.service.js';

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  from.mockClear();
  query.filters = [];
  query.data = null;
  query.error = null;
});

describe('mobile authentication service', () => {
  it('persists only SHA-256 token digests and keeps access expiry short', async () => {
    const issued = await createMobileSession();
    const [, args] = rpc.mock.calls[0];
    expect(rpc).toHaveBeenCalledWith('nc_mobile_session_create', expect.objectContaining({
      p_access_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_refresh_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(args.p_access_hash).not.toBe(issued.accessToken);
    expect(args.p_refresh_hash).not.toBe(issued.refreshToken);
    expect(Date.parse(issued.accessExpiresAt) - Date.now()).toBeLessThanOrEqual(MOBILE_ACCESS_MS);
    expect(Date.parse(issued.refreshExpiresAt) - Date.now()).toBeLessThanOrEqual(MOBILE_REFRESH_MS);
    expect(issued.identityId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('rejects malformed refresh values without calling the database', async () => {
    await expect(rotateMobileSession('not-a-token')).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps the rotation RPC response and matches its argument names', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'rotated', identity_id: '11111111-1111-4111-8111-111111111111' }, error: null });
    const issued = await rotateMobileSession('a'.repeat(64));
    expect(rpc).toHaveBeenCalledWith('nc_mobile_session_rotate', expect.objectContaining({
      p_refresh_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_access_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_next_refresh_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(issued?.identityId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('requires both unrevoked session expiry windows for socket revalidation', async () => {
    query.data = { id: 'session-id', account_id: null, identity_id: '11111111-1111-4111-8111-111111111111' };
    await expect(verifyMobileSession('11111111-1111-4111-8111-111111111111')).resolves.toMatchObject({ id: 'session-id' });
    expect(query.filters).toContainEqual(['is', ['revoked_at', null]]);
    expect(query.filters).toContainEqual(['gt', ['access_expires_at', expect.any(String)]]);
    expect(query.filters).toContainEqual(['gt', ['refresh_expires_at', expect.any(String)]]);
  });

  it('rejects access tokens after database expiry or revocation', async () => {
    await expect(verifyMobileAccess('a'.repeat(64))).resolves.toBeNull();
    expect(query.filters).toContainEqual(['is', ['revoked_at', null]]);
    expect(query.filters).toContainEqual(['gt', ['access_expires_at', expect.any(String)]]);
  });
});
