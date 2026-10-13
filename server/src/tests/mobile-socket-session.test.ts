import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, verifyMobileSession, mobileAccountActive } = vi.hoisted(() => {
  const state = { principal: { id: '11111111-1111-4111-8111-111111111111', accountId: null as string | null, identityId: '22222222-2222-4222-8222-222222222222' }, valid: true, accountActive: true };
  const verifyMobileSession = vi.fn(async () => state.valid ? state.principal : null);
  const mobileAccountActive = vi.fn(async () => state.accountActive);
  return { state, verifyMobileSession, mobileAccountActive };
});

vi.mock('../services/mobile-auth.service.js', () => ({ verifyMobileSession, mobileAccountActive }));
vi.mock('../services/account.service.js', () => ({ verifyAccountCookie: vi.fn() }));
vi.mock('../services/session.service.js', () => ({ readCookie: vi.fn(), verifySession: vi.fn() }));
vi.mock('../middlewares/auth.middleware.js', () => ({ accessCookie: () => 'nc_access' }));

import { socketSessionValid } from '../sockets/auth.js';

const guestSocket = () => ({ data: { mobileSessionId: state.principal.id, identity: state.principal.identityId } }) as never;

beforeEach(() => {
  state.valid = true;
  state.accountActive = true;
  state.principal.accountId = null;
  vi.clearAllMocks();
});

describe('mobile Socket.IO session revalidation', () => {
  it('keeps an active socket authorized by stable session ID after credential rotation', async () => {
    expect(await socketSessionValid(guestSocket())).toBe(true);
    expect(verifyMobileSession).toHaveBeenCalledWith(state.principal.id);
  });

  it('rejects a revoked or expired mobile session even when the peer identity matches', async () => {
    state.valid = false;
    expect(await socketSessionValid(guestSocket())).toBe(false);
  });

  it('checks account profile activity for registered sockets', async () => {
    state.principal.accountId = '33333333-3333-4333-8333-333333333333';
    const socket = { data: { mobileSessionId: state.principal.id, identity: 'room-sender', accountId: state.principal.accountId } } as never;
    state.accountActive = false;
    expect(await socketSessionValid(socket)).toBe(false);
    expect(mobileAccountActive).toHaveBeenCalledWith(state.principal.accountId);
  });
});
