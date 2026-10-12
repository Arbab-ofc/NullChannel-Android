import {NavLink} from 'react-router-dom';
import {House,MessagesSquare,Compass,Bell,User} from 'lucide-react';
import {useViewportState} from '../../hooks/useVisibleViewport';
const destinations=[['/dashboard','Home',House],['/privacy','Sessions',MessagesSquare],['/explore','Explore',Compass],['/notifications','Alerts',Bell],['/profile','Profile',User]] as const;
export function MobileBottomNavigation(){const {keyboardOpen}=useViewportState();return <nav className="mobile-bottom-nav" aria-label="Mobile navigation" hidden={keyboardOpen}>{destinations.map(([to,label,Icon])=><NavLink key={to} to={to} end className={({isActive})=>isActive?'active':''}><Icon aria-hidden="true"/><span>{label}</span></NavLink>)}</nav>;}
