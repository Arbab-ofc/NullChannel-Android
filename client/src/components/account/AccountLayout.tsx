import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAccount } from '../../hooks/useAccount';
import { ThemeToggle } from '../common/ThemeToggle';
import { Button } from '../common/Button';
import { NotificationBell } from './NotificationBell';
import { accountError } from '../../lib/account';
export const accountLinks = [['/dashboard','Dashboard'],['/friends','Friends'],['/friends/requests','Requests'],['/explore','Explore'],['/groups/create','Create Group'],['/match','Random Match'],['/invitations','Invitations'],['/notifications','Notifications'],['/privacy','Privacy'],['/profile','Profile'],['/settings','Settings']] as const;
export function AccountLayout() {
  const {profile,loading,logout} = useAccount(); const location = useLocation(); const navigate = useNavigate(); const [error,setError] = useState(''); const [mobileNavOpen,setMobileNavOpen]=useState(false);
  useEffect(()=>setMobileNavOpen(false),[location.pathname]);
  if (loading) return <main className="p-8" role="status">Restoring your account…</main>;
  if (!profile) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname+location.search)}`} replace />;
  if(profile.deletion_pending&&location.pathname!=='/settings')return <Navigate to="/settings" replace/>;
  return <div className="mx-auto min-h-[80dvh] max-w-7xl p-3 sm:p-6">
    <header className="neo-panel mb-6 flex flex-wrap items-center justify-between gap-3 p-4"><NavLink to="/" className="code-font text-xl font-bold">NullChannel</NavLink><div className="flex items-center gap-3">{!profile.deletion_pending&&<NotificationBell />}<ThemeToggle /><Button onClick={() => { void logout().then(() => navigate('/')).catch(e => setError(accountError(e))); }}>Logout</Button></div></header>
    {error && <p role="alert" className="mb-4 text-punch">{error}</p>}
    <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]"><div className="lg:hidden"><Button aria-expanded={mobileNavOpen} aria-controls="account-navigation" onClick={()=>setMobileNavOpen(value=>!value)}>{mobileNavOpen?'Close menu':'Menu'}</Button></div><nav id="account-navigation" aria-label="Account navigation" className={`${mobileNavOpen?'flex':'hidden'} neo-panel flex-col gap-1 p-3 lg:flex lg:self-start`}>{(profile.deletion_pending?accountLinks.filter(([to])=>to==='/settings'):accountLinks).map(([to,label]) => <NavLink key={to} to={to} end className={({isActive}) => `px-3 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan ${isActive ? 'bg-accent/15 font-bold text-cyan' : 'text-muted'}`}>{label}</NavLink>)}</nav><main className="min-w-0"><Outlet /></main></div>
  </div>;
}
