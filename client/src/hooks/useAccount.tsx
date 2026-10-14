import {revokeNativeCalling} from '../lib/native-call-coordinator';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import axios from 'axios';
import { accountApi, accountError, type Profile } from '../lib/account';
import { disconnectSocket } from '../lib/socket';
import { accountSocket, connectAccountSocket } from '../lib/account-socket';
import { isNativeMobile, mobileLogout } from '../lib/mobile-auth';
const Context = createContext<{profile: Profile | null; loading: boolean; error?:string; refresh: () => Promise<void>; logout: () => Promise<void>} | null>(null);
export function AccountProvider({children}: {children: ReactNode}) {
  const generation=useRef(0);
  const [profile,setProfile] = useState<Profile | null>(null);
  const profileRef=useRef(profile);profileRef.current=profile;
  const [error,setError]=useState('');
  const [loading,setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const requestGeneration=++generation.current;setError('');
    try { const res = await accountApi.get('/account/me'); if(requestGeneration===generation.current)setProfile(res.data.data.profile); }
    catch(failure) { if(requestGeneration===generation.current){if(axios.isAxiosError(failure)&&failure.response?.status===401){setProfile(null);console.info('account_transition',{reason:'session_invalid'});}else{setError(accountError(failure));console.info('account_transition',{reason:'validation_unavailable'});}} }
    finally { if(requestGeneration===generation.current)setLoading(false); }
  },[]);
  useEffect(() => { void refresh(); },[refresh]);
  useEffect(() => {
    const clear = () => { generation.current++; if(profileRef.current&&!isNativeMobile())disconnectSocket(); accountSocket.disconnect(); setProfile(null); setError('');setLoading(false);console.info('account_transition',{reason:'explicit_or_confirmed_session_end'}); };
    const changed = (event:StorageEvent) => { if(event.key==='nullchannel_account_event') { if(event.newValue?.startsWith('logout:'))clear();else void refresh(); } };
    window.addEventListener('storage',changed);window.addEventListener('nullchannel-account-expired',clear);
    return () => { window.removeEventListener('storage',changed);window.removeEventListener('nullchannel-account-expired',clear); };
  },[refresh]);
  const username = profile?.deletion_pending?undefined:profile?.username;
  useEffect(() => {
    if (!username) { accountSocket.disconnect(); return; }
    connectAccountSocket();
    const heartbeat = () => accountSocket.emit('presence:heartbeat');
    accountSocket.on('connect', heartbeat);
    const interval = window.setInterval(heartbeat, 30000);
    const resume=()=>{if(!document.hidden&&!accountSocket.connected)connectAccountSocket();};document.addEventListener('visibilitychange',resume);window.addEventListener('nullchannel-app-resume',resume);
    return () => { window.clearInterval(interval);document.removeEventListener('visibilitychange',resume);window.removeEventListener('nullchannel-app-resume',resume); accountSocket.off('connect',heartbeat); accountSocket.disconnect(); };
  },[username]);
  const logout = async () => {if(isNativeMobile())await revokeNativeCalling();const request=()=>isNativeMobile()?mobileLogout():accountApi.post('/account/logout');if(typeof navigator!=='undefined'&&navigator.locks)await navigator.locks.request('nullchannel-account-refresh',request);else await request();console.info('account_transition',{reason:'logout_confirmed'}); generation.current++;setError(''); setLoading(false); disconnectSocket(); accountSocket.disconnect(); setProfile(null); try{localStorage.setItem('nullchannel_account_event',`logout:${Date.now()}`);}catch{/* Server logout remains authoritative when storage is blocked. */} };
  return <Context.Provider value={{profile,loading,error,refresh,logout}}>{children}</Context.Provider>;
}
export function useAccount() { const value = useContext(Context); if (!value) throw new Error('AccountProvider required'); return value; }

export function useOptionalAccount(){return useContext(Context);}
