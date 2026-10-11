import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { accountApi, type Profile } from '../lib/account';
import { disconnectSocket } from '../lib/socket';
import { accountSocket } from '../lib/account-socket';
const Context = createContext<{profile: Profile | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void>} | null>(null);
export function AccountProvider({children}: {children: ReactNode}) {
  const generation=useRef(0);
  const [profile,setProfile] = useState<Profile | null>(null);
  const [loading,setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const requestGeneration=++generation.current;
    try { const res = await accountApi.get('/account/me'); if(requestGeneration===generation.current)setProfile(res.data.data.profile); }
    catch { if(requestGeneration===generation.current)setProfile(null); }
    finally { if(requestGeneration===generation.current)setLoading(false); }
  },[]);
  useEffect(() => { void refresh(); },[refresh]);
  useEffect(() => {
    const clear = () => { generation.current++; disconnectSocket(); accountSocket.disconnect(); setProfile(null); setLoading(false); };
    const changed = (event:StorageEvent) => { if(event.key==='nullchannel_account_event') { if(event.newValue?.startsWith('logout:'))clear();else void refresh(); } };
    window.addEventListener('storage',changed);window.addEventListener('nullchannel-account-expired',clear);
    return () => { window.removeEventListener('storage',changed);window.removeEventListener('nullchannel-account-expired',clear); };
  },[refresh]);
  const username = profile?.deletion_pending?undefined:profile?.username;
  useEffect(() => {
    if (!username) { accountSocket.disconnect(); return; }
    accountSocket.connect();
    const heartbeat = () => accountSocket.emit('presence:heartbeat');
    accountSocket.on('connect', heartbeat);
    const interval = window.setInterval(heartbeat, 30000);
    return () => { window.clearInterval(interval); accountSocket.off('connect',heartbeat); accountSocket.disconnect(); };
  },[username]);
  const logout = async () => { await accountApi.post('/account/logout'); generation.current++; setLoading(false); disconnectSocket(); accountSocket.disconnect(); setProfile(null); localStorage.setItem('nullchannel_account_event',`logout:${Date.now()}`); };
  return <Context.Provider value={{profile,loading,refresh,logout}}>{children}</Context.Provider>;
}
export function useAccount() { const value = useContext(Context); if (!value) throw new Error('AccountProvider required'); return value; }
