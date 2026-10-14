import axios from 'axios';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Socket } from 'socket.io-client';
import { API_URL } from './constants';

type Kind = 'account' | 'guest';
type NativeStore = {
  get(options: { key: string }): Promise<{ value?: string }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};
type TokenBundle = { accessToken: string; refreshToken: string; accessExpiresAt: string; refreshExpiresAt: string; identityId: string | null };
type AuthResponse = TokenBundle & { profile?: unknown; verification_required?: boolean };
const store = registerPlugin<NativeStore>('SecureCredentialStore');
const native = () => Capacitor.isNativePlatform();
const ACCESS_REFRESH_AHEAD_MS = 2 * 60 * 1000;
const key = (kind: Kind) => `mobile.${kind}.bundle`;
const pendingRefresh = new Map<Kind, Promise<TokenBundle | null>>();
const memory = new Map<Kind, TokenBundle>();
const logoutInFlight = new Set<Kind>();
let mobileSessionEndpointUnavailable = false;

export const isMobileSessionEndpointUnavailable = () => native() && mobileSessionEndpointUnavailable;

async function readBundle(kind: Kind): Promise<TokenBundle | null> {
  const cached = memory.get(kind);
  if (cached) return cached;
  if (!native()) return null;
  const stored=await store.get({key:key(kind)});
  if(!stored.value)return null;
  try{
    const value=JSON.parse(stored.value) as Partial<TokenBundle>;
    if(typeof value.accessToken!=='string'||typeof value.refreshToken!=='string'||typeof value.accessExpiresAt!=='string'||typeof value.refreshExpiresAt!=='string')return null;
    return {accessToken:value.accessToken,refreshToken:value.refreshToken,accessExpiresAt:value.accessExpiresAt,refreshExpiresAt:value.refreshExpiresAt,identityId:typeof value.identityId==='string'?value.identityId:null};
  }catch{return null;}
}

async function saveBundle(kind: Kind, bundle: TokenBundle): Promise<void> {
  if (!native()) throw new Error('Secure Android credential storage is unavailable.');
  await store.set({key:key(kind),value:JSON.stringify(bundle)});
  memory.set(kind, bundle);
  if(typeof window!=='undefined')window.dispatchEvent(new Event('nullchannel-mobile-session-changed'));
}

export async function clearMobileCredentials(kind: Kind): Promise<void> {
  memory.delete(kind);
  if (!native()) return;
  await store.remove({key:key(kind)});
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('nullchannel-mobile-session-ended',{detail:{kind}}));
}

async function refreshBundle(kind: Kind): Promise<TokenBundle | null> {
  const existing = pendingRefresh.get(kind);
  if (existing) return existing;
  if (logoutInFlight.has(kind)) return null;
  const refresh = (async () => {
    const current = await readBundle(kind);
    if (!current?.refreshToken) return null;
    try {
      const response = await axios.post(`${API_URL}/api/mobile/auth/refresh`, null, {
        withCredentials: false,
        headers: { Authorization: `Bearer ${current.refreshToken}` }
      });
      const next = response.data.data as TokenBundle;
      const bundle = { ...next, identityId: next.identityId ?? current.identityId };
      await saveBundle(kind, bundle);
      return bundle;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await clearMobileCredentials(kind);
        if (kind === 'account' && typeof window !== 'undefined') window.dispatchEvent(new Event('nullchannel-account-expired'));
        return null;
      }
      throw error;
    }
  })().finally(() => pendingRefresh.delete(kind));
  pendingRefresh.set(kind, refresh);
  return refresh;
}

async function bundle(kind: Kind, forceRefresh = false): Promise<TokenBundle | null> {
  const current = await readBundle(kind);
  if (!current) return null;
  const expires = Date.parse(current.accessExpiresAt);
  if (!forceRefresh && current.accessToken && Number.isFinite(expires) && expires > Date.now() + 30000) return current;
  return refreshBundle(kind);
}

export async function mobileAccessToken(kind: Kind, forceRefresh = false): Promise<string | null> {
  return (await bundle(kind, forceRefresh))?.accessToken || null;
}

export async function mobileSocketCredentials(forceRefresh = false): Promise<{ accountToken?: string; guestToken?: string }> {
  if (!native()) return {};
  const [accountToken, guestToken] = await Promise.all([mobileAccessToken('account',forceRefresh), mobileAccessToken('guest',forceRefresh)]);
  return { ...(accountToken ? { accountToken } : {}), ...(guestToken ? { guestToken } : {}) };
}

export async function configureMobileSocket(socket: Socket, roomCode?: string, forceRefresh = false): Promise<void> {
  if (!native()) return;
  const credentials = await mobileSocketCredentials(forceRefresh);
  socket.auth = { ...(roomCode ? { roomCode } : {}), ...credentials };
}

export async function ensureMobileGuestSession(): Promise<string> {
  const current = await bundle('guest');
  if (current?.accessToken && current.identityId) return current.identityId;
  let response;
  try {
    response = await axios.post(`${API_URL}/api/mobile/session`, {}, { withCredentials: false });
    mobileSessionEndpointUnavailable = false;
  } catch (error) {
    if (axios.isAxiosError(error) && ((error.response?.status === 401 && error.response.data?.error?.code === 'SESSION_EXPIRED') || (error.response?.status === 403 && error.response.data?.error?.code === 'CSRF_REJECTED'))) {
      // These responses mean the deployed server is not accepting the bundled
      // mobile session path/origin. Preserve the diagnosis for the room UI.
      mobileSessionEndpointUnavailable = true;
    }
    throw error;
  }
  const issued = response.data.data as TokenBundle;
  if (!issued.identityId) throw new Error('The guest session could not be restored.');
  await saveBundle('guest', issued);
  return issued.identityId;
}

/** Rotate before access expiry so the 15-second server socket revalidator sees
 * the same session row with fresh expiry instead of dropping active sockets. */
export async function refreshMobileCredentialsBeforeExpiry(): Promise<void> {
  if (!native()) return;
  await Promise.all((['guest', 'account'] as const).map(async kind => {
    const current = await readBundle(kind);
    if (!current) return;
    const expiry = Date.parse(current.accessExpiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now() + ACCESS_REFRESH_AHEAD_MS) await refreshBundle(kind);
  }));
}

export async function mobileLogin(email: string, password: string): Promise<AuthResponse> {
  const response = await axios.post(`${API_URL}/api/mobile/auth/login`, { email, password }, { withCredentials: false });
  const result = response.data.data as AuthResponse;
  if (result.accessToken && result.refreshToken) await saveBundle('account', { ...result, identityId: null });
  return result;
}

export async function mobileSignup(username: string, email: string, password: string): Promise<AuthResponse> {
  const response = await axios.post(`${API_URL}/api/mobile/auth/signup`, { username, email, password }, { withCredentials: false });
  const result = response.data.data as AuthResponse;
  if (result.accessToken && result.refreshToken) await saveBundle('account', { ...result, identityId: null });
  return result;
}

export async function mobileLogout(): Promise<void> {
  logoutInFlight.add('account');
  try {
    await pendingRefresh.get('account')?.catch(() => null);
    const current = await readBundle('account');
    if (!current?.refreshToken) { await clearMobileCredentials('account'); return; }
    try {
      await axios.post(`${API_URL}/api/mobile/auth/logout`, null, {
        withCredentials: false,
        headers: { Authorization: `Bearer ${current.refreshToken}` }
      });
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
    }
    await clearMobileCredentials('account');
  } finally {
    logoutInFlight.delete('account');
  }
}

export const isNativeMobile = () => native();
