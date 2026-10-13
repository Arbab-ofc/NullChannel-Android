import axios,{type AxiosRequestConfig} from 'axios';
import { API_URL, IS_NATIVE_APP } from './constants';
import { mobileAccessToken } from './mobile-auth';
/** Registered requests never trigger anonymous-session renewal or replay authentication actions. */
export const accountApi = axios.create({ baseURL: `${API_URL}/api`, withCredentials: true, timeout: 20000 });
let refreshing: Promise<unknown> | null = null;
// With Web Locks, logout is serialized by AccountProvider; waiting here while
// holding that lock could deadlock a refresh queued behind logout.
accountApi.interceptors.request.use(async config=>{
  if(config.url==='/account/logout'&&refreshing&&(typeof navigator==='undefined'||!navigator.locks))await refreshing.catch(()=>undefined);
  if(IS_NATIVE_APP){config.withCredentials=false;const access=await mobileAccessToken('account');if(access)config.headers.set('Authorization',`Bearer ${access}`);}
  return config;
});
accountApi.interceptors.response.use(response => response, async error => {
  const config = error.config;
  if(IS_NATIVE_APP&&error.response?.status===401&&config&&!config.mobileRetried&&!/^\/mobile\//.test(config.url??'')){
    config.mobileRetried=true;
    const access=await mobileAccessToken('account',true);
    if(access){config.headers.set('Authorization',`Bearer ${access}`);return accountApi.request(config);}
    if(config.url==='/account/me'&&typeof window!=='undefined')window.dispatchEvent(new Event('nullchannel-account-expired'));
    return Promise.reject(error);
  }
  const publicAuth = /^\/account\/(login|logout|signup|forgot-password|reset-password|refresh|password|delete)$/.test(config?.url ?? '');
  if (!IS_NATIVE_APP&&error.response?.status === 401 && config && !config.accountRetried && !publicAuth) {
    config.accountRetried = true;
    refreshing ??= (async()=>{const renew=async()=>{try{await accountApi.get('/account/me',{accountRetried:true} as AxiosRequestConfig&{accountRetried:boolean});return;}catch(check){if(!axios.isAxiosError(check)||check.response?.status!==401)throw check;}return accountApi.post('/account/refresh');};return typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request('nullchannel-account-refresh',renew):renew();})().finally(() => { refreshing = null; });
    try { await refreshing; } catch (failure) { if(axios.isAxiosError(failure)&&failure.response?.status===401&&typeof window!=='undefined')window.dispatchEvent(new Event('nullchannel-account-expired')); throw failure; }
    try{return await accountApi.request(config);}catch(failure){if(axios.isAxiosError(failure)&&failure.response?.status===401&&config.url==='/account/me')window.dispatchEvent(new Event('nullchannel-account-expired'));throw failure;}
  }
  return Promise.reject(error);
});
export type Profile = { username: string; display_name: string; bio?: string; avatar_url?: string | null; deletion_pending?:boolean; privacy?: Record<string, unknown> };
export function accountError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (IS_NATIVE_APP && ['SESSION_EXPIRED','CSRF_REJECTED'].includes(error.response?.data?.error?.code) && /\/api\/mobile\/(?:auth\/(?:login|signup)|session)/.test(error.config?.url ?? '')) {
      return 'Android sign-in is not enabled for this app on the server yet. The mobile endpoints and https://localhost origin must be configured.';
    }
    if (error.response?.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.response?.status === 401) return 'Please sign in again, or check your credentials.';
    const message = error.response?.data?.error?.message ?? error.response?.data?.error;
    if (typeof message === 'string' && !/[{}]|postgres|SQL|stack/i.test(message)) return message;
    if (!error.response) return 'Unable to reach NullChannel. Check your connection and try again.';
  }
  return 'This action could not be completed. Please try again.';
}
