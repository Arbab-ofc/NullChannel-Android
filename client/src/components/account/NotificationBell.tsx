import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { accountApi } from '../../lib/account';
import { accountSocket } from '../../lib/account-socket';
export function NotificationBell() {
  const [unread,setUnread]=useState<number | null>(null);
  const load=useCallback(async()=>{try{const r=await accountApi.get('/notifications/unread');setUnread(r.data.data.count);}catch{setUnread(null);}},[]);
  useEffect(()=>{void load();accountSocket.on('notifications:update',load);window.addEventListener('nullchannel-notifications-updated',load);return()=>{accountSocket.off('notifications:update',load);window.removeEventListener('nullchannel-notifications-updated',load);};},[load]);
  return <Link to="/notifications" className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full border border-accent/30" aria-label={unread===null?'Notifications':`Notifications, ${unread} unread`}><Bell size={18}/>{unread!==null&&unread>0&&<span className="absolute -right-2 -top-2 rounded-full bg-accent px-1.5 py-0.5 text-xs font-bold text-bg">{unread>99?'99+':unread}</span>}</Link>;
}
