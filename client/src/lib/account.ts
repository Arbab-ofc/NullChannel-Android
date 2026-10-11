import axios from 'axios';
import { API_URL } from './constants';
/** Registered requests never trigger anonymous-session renewal or replay authentication actions. */
export const accountApi = axios.create({ baseURL: `${API_URL}/api`, withCredentials: true, timeout: 20000 });
let refreshing: Promise<unknown> | null = null;
accountApi.interceptors.response.use(response => response, async error => {
  const config = error.config;
  const publicAuth = /^\/account\/(login|signup|forgot-password|reset-password|refresh|password|delete)$/.test(config?.url ?? '');
  if (error.response?.status === 401 && config && !config.accountRetried && !publicAuth) {
    config.accountRetried = true;
    refreshing ??= accountApi.post('/account/refresh').finally(() => { refreshing = null; });
    try { await refreshing; } catch (failure) { if(typeof window!=='undefined')window.dispatchEvent(new Event('nullchannel-account-expired')); throw failure; }
    return accountApi.request(config);
  }
  return Promise.reject(error);
});
export type Profile = { username: string; display_name: string; bio?: string; avatar_url?: string | null; deletion_pending?:boolean; privacy?: Record<string, unknown> };
export function accountError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.response?.status === 401) return 'Please sign in again, or check your credentials.';
    const message = error.response?.data?.error?.message ?? error.response?.data?.error;
    if (typeof message === 'string' && !/[{}]|postgres|SQL|stack/i.test(message)) return message;
    if (!error.response) return 'Unable to reach NullChannel. Check your connection and try again.';
  }
  return 'This action could not be completed. Please try again.';
}
