import { FloatingHeader, HeaderOverflow } from '../navigation/FloatingHeader';
import { MobileBottomNavigation } from '../mobile/MobileBottomNavigation';
import { Skeleton } from '../common/Skeleton';
import { LayoutDashboard, Users, UserPlus, Compass, Plus, Shuffle, Mail, Bell, Shield, User, Settings, Menu, ArrowUpRight } from 'lucide-react';
import { Brand } from '../common/Brand';
import { NavigationOverlay } from '../common/NavigationOverlay';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '../../hooks/useAccount';
import { ThemeToggle } from '../common/ThemeToggle';
import { Button } from '../common/Button';
import { NotificationBell } from './NotificationBell';
import { accountError } from '../../lib/account';
export const accountLinks = [['/dashboard','Dashboard'],['/friends','Friends'],['/friends/requests','Requests'],['/explore','Explore'],['/groups/create','Create Group'],['/match','Random Match'],['/invitations','Invitations'],['/notifications','Notifications'],['/privacy','Privacy'],['/profile','Profile'],['/settings','Settings']] as const;
const icons=[LayoutDashboard,Users,UserPlus,Compass,Plus,Shuffle,Mail,Bell,Shield,User,Settings];
export function AccountLayout() {
  const {profile,loading,logout} = useAccount(); const location = useLocation(); const navigate = useNavigate(); const [error,setError] = useState(''); const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const closeNav=useCallback(()=>setMobileNavOpen(false),[]);
  useEffect(()=>setMobileNavOpen(false),[location.pathname]);
  if (loading) return <main className="p-8"><Skeleton kind="profile" label="Restoring your account"/></main>;
  if (!profile) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname+location.search)}`} replace />;
  if(profile.deletion_pending&&location.pathname!=='/settings')return <Navigate to="/settings" replace/>;
  const destinations=profile.deletion_pending?accountLinks.filter(([to])=>to==='/settings'):accountLinks;
  const primaryPaths=['/dashboard','/friends','/explore'];
  const overflow=destinations.filter(([to])=>!primaryPaths.includes(to));
  const links=destinations.map(([to,label])=>{const Icon=icons[accountLinks.findIndex(([path])=>path===to)];return <NavLink key={to} to={to} end className={({isActive})=>isActive?'active':''}><Icon aria-hidden="true"/><span>{label}</span></NavLink>;});
  return <div className="account-shell">
    <FloatingHeader className="account-header" panelContent={<><nav aria-label="Account destinations">{links}</nav><div className="infinite-navigation__actions">{!profile.deletion_pending&&<NotificationBell/>}<ThemeToggle/><Button variant="ghost" onClick={()=>{void logout().then(()=>navigate('/')).catch(e=>setError(accountError(e)));}}>Logout</Button></div></>}><NavLink to="/" aria-label="NullChannel home"><Brand/></NavLink><nav className="large-header-nav" aria-label="Primary account destinations">{destinations.filter(([to])=>primaryPaths.includes(to)||profile.deletion_pending).map(([to,label])=><NavLink key={to} to={to} end>{label}</NavLink>)}{!profile.deletion_pending&&<HeaderOverflow active={overflow.some(([to])=>to===location.pathname)}>{overflow.map(([to,label])=>{const Icon=icons[accountLinks.findIndex(([path])=>path===to)];return <NavLink key={to} to={to} end><Icon aria-hidden="true"/>{label}</NavLink>;})}</HeaderOverflow>}</nav><div className="account-header__tools">{!profile.deletion_pending&&<NotificationBell/>}<ThemeToggle/><Button variant="ghost" onClick={()=>{void logout().then(()=>navigate('/')).catch(e=>setError(accountError(e)));}}>Logout</Button><Button className="account-menu" aria-label="Open account navigation" aria-expanded={mobileNavOpen} aria-controls="account-mobile-navigation" onClick={()=>setMobileNavOpen(true)}><Menu aria-hidden="true"/></Button></div></FloatingHeader>
    {error&&<p role="alert" className="mt-4 text-punch">{error}</p>}
    <div className="account-body"><aside className="hidden lg:block"><nav id="account-navigation" aria-label="Account navigation" className="account-navigation"><span className="account-navigation__caption">Your space</span>{links}<NavLink to="/"><ArrowUpRight aria-hidden="true"/>Continue anonymously</NavLink><div className="account-profile"><strong>{profile.display_name||profile.username}</strong><span>@{profile.username}</span></div></nav></aside><main className="min-w-0"><Outlet/></main></div>
    {!profile.deletion_pending && <MobileBottomNavigation/>}
    <NavigationOverlay desktopBreakpoint={1024} id="account-mobile-navigation" title="Your space." open={mobileNavOpen} close={closeNav}><div className="account-navigation">{links}</div></NavigationOverlay>
  </div>;
}
