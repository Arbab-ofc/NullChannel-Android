import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ values: new Map<string, string>(), post: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({
    get: async ({ key }: { key: string }) => ({ value: state.values.get(key) }),
    set: async ({ key, value }: { key: string; value: string }) => { state.values.set(key, value); },
    remove: async ({ key }: { key: string }) => { state.values.delete(key); }
  })
}));
vi.mock('axios', () => ({ default: { post: state.post, isAxiosError: (error: unknown) => Boolean(error && typeof error === 'object' && 'isAxiosError' in error) } }));

let clearMobileCredentials: typeof import('../lib/mobile-auth').clearMobileCredentials;
let mobileAccessToken: typeof import('../lib/mobile-auth').mobileAccessToken;
let mobileLogin: typeof import('../lib/mobile-auth').mobileLogin;
let mobileLogout: typeof import('../lib/mobile-auth').mobileLogout;
let refreshMobileCredentialsBeforeExpiry: typeof import('../lib/mobile-auth').refreshMobileCredentialsBeforeExpiry;
let ensureMobileGuestSession: typeof import('../lib/mobile-auth').ensureMobileGuestSession;
let isMobileSessionEndpointUnavailable: typeof import('../lib/mobile-auth').isMobileSessionEndpointUnavailable;

const credential = (n: string) => n.repeat(64);
const payload = (accessToken: string, refreshToken: string) => ({
  accessToken, refreshToken,
  accessExpiresAt: new Date(Date.now() + 600000).toISOString(),
  refreshExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  identityId: null
});

describe('Android mobile credentials', () => {
  beforeEach(async () => { state.values.clear(); state.post.mockReset();vi.resetModules();({clearMobileCredentials,mobileAccessToken,mobileLogin,mobileLogout,refreshMobileCredentialsBeforeExpiry,ensureMobileGuestSession,isMobileSessionEndpointUnavailable}=await import('../lib/mobile-auth')); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('stores login tokens through the native secure store and uses the fixed HTTPS API', async () => {
    state.post.mockResolvedValueOnce({ data: { data: payload(credential('a'), credential('b')) } });
    await mobileLogin('user@example.test', 'dummy-password-for-test');
    expect(state.post).toHaveBeenCalledWith('https://nullchannel.teleflow.cyou/api/mobile/auth/login', {
      email: 'user@example.test', password: 'dummy-password-for-test'
    }, { withCredentials: false });
    expect(JSON.parse(state.values.get('mobile.account.bundle')!).accessToken).toBe(credential('a'));
    expect(JSON.parse(state.values.get('mobile.account.bundle')!).refreshToken).toBe(credential('b'));
  });

  it('rotates credentials using the refresh value in an Authorization header', async () => {
    state.values.set('mobile.account.bundle', JSON.stringify({...payload(credential('a'),credential('b')),accessExpiresAt:new Date(0).toISOString()}));
    state.post.mockResolvedValueOnce({ data: { data: payload(credential('c'), credential('d')) } });
    await expect(mobileAccessToken('account')).resolves.toBe(credential('c'));
    expect(state.post).toHaveBeenCalledWith('https://nullchannel.teleflow.cyou/api/mobile/auth/refresh', null, {
      withCredentials: false, headers: { Authorization: `Bearer ${credential('b')}` }
    });
    expect(JSON.parse(state.values.get('mobile.account.bundle')!).refreshToken).toBe(credential('d'));
  });

  it('coalesces concurrent access-token refreshes into one rotation', async () => {
    state.values.set('mobile.account.bundle', JSON.stringify(payload(credential('a'),credential('b'))));
    state.post.mockResolvedValueOnce({ data: { data: payload(credential('c'), credential('d')) } });
    const results = await Promise.all([mobileAccessToken('account',true),mobileAccessToken('account',true)]);
    expect(results).toEqual([credential('c'),credential('c')]);
    expect(state.post).toHaveBeenCalledTimes(1);
    expect(JSON.parse(state.values.get('mobile.account.bundle')!).refreshToken).toBe(credential('d'));
  });

  it('waits for an in-flight refresh before revoking and clearing account credentials', async () => {
    state.values.set('mobile.account.bundle', JSON.stringify({...payload(credential('a'),credential('b')),accessExpiresAt:new Date(0).toISOString()}));
    let finishRefresh!: (value: unknown) => void;
    state.post.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    const tokenRequest = mobileAccessToken('account');
    await vi.waitFor(() => expect(state.post).toHaveBeenCalledOnce());
    state.post.mockResolvedValueOnce({ data: { data: { logged_out: true } } });
    const logout = mobileLogout();
    finishRefresh({ data: { data: payload(credential('c'),credential('d')) } });
    await Promise.all([tokenRequest,logout]);
    expect(state.post).toHaveBeenNthCalledWith(2,'https://nullchannel.teleflow.cyou/api/mobile/auth/logout',null,{
      withCredentials:false,headers:{Authorization:`Bearer ${credential('d')}`}
    });
    expect(state.values.has('mobile.account.bundle')).toBe(false);
  });

  it('refreshes tokens two minutes before expiry so active sockets keep the same session', async () => {
    state.values.set('mobile.guest.bundle', JSON.stringify({...payload(credential('a'),credential('b')),accessExpiresAt:new Date(Date.now()+90_000).toISOString()}));
    state.post.mockResolvedValueOnce({ data: { data: payload(credential('c'), credential('d')) } });
    await refreshMobileCredentialsBeforeExpiry();
    expect(state.post).toHaveBeenCalledOnce();
    expect(state.post).toHaveBeenCalledWith('https://nullchannel.teleflow.cyou/api/mobile/auth/refresh', null, {
      withCredentials: false, headers: { Authorization: `Bearer ${credential('b')}` }
    });
    expect(JSON.parse(state.values.get('mobile.guest.bundle')!).accessToken).toBe(credential('c'));
  });

  it('does not rotate a token with more than two minutes remaining', async () => {
    state.values.set('mobile.guest.bundle', JSON.stringify(payload(credential('a'),credential('b'))));
    await refreshMobileCredentialsBeforeExpiry();
    expect(state.post).not.toHaveBeenCalled();
  });

  it('identifies an old server falling through to anonymous-session middleware', async () => {
    state.post.mockRejectedValueOnce({isAxiosError:true,response:{status:401,data:{error:{code:'SESSION_EXPIRED'}}}});
    await expect(ensureMobileGuestSession()).rejects.toMatchObject({response:{status:401}});
    expect(isMobileSessionEndpointUnavailable()).toBe(true);
  });

  it('identifies a server that rejects the Capacitor Origin', async () => {
    state.post.mockRejectedValueOnce({isAxiosError:true,response:{status:403,data:{error:{code:'CSRF_REJECTED'}}}});
    await expect(ensureMobileGuestSession()).rejects.toMatchObject({response:{status:403}});
    expect(isMobileSessionEndpointUnavailable()).toBe(true);
  });

  it('revokes with the refresh token and removes both tokens from native storage', async () => {
    state.values.set('mobile.account.bundle', JSON.stringify(payload(credential('a'),credential('b'))));
    state.post.mockResolvedValueOnce({ data: { data: { logged_out: true } } });
    await mobileLogout();
    expect(state.post).toHaveBeenCalledWith('https://nullchannel.teleflow.cyou/api/mobile/auth/logout', null, {
      withCredentials: false, headers: { Authorization: `Bearer ${credential('b')}` }
    });
    expect(state.values.has('mobile.account.bundle')).toBe(false);
    await clearMobileCredentials('guest');
  });
});
