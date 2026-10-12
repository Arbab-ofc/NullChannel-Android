import {useEffect,useState} from 'react';
import {Timer} from 'lucide-react';
import {expiryInfo} from '../../lib/room-presentation';
export const ExpiryCountdown=({expiresAt,createdAt}:{expiresAt?:string|null;createdAt?:string|null})=>{
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{setNow(Date.now());if(!expiresAt||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now())return;const deadline=Date.parse(expiresAt);const timer=setInterval(()=>{const current=Date.now();setNow(current);if(current>=deadline)clearInterval(timer);},1000);return()=>clearInterval(timer);},[expiresAt]);
 const info=expiryInfo(expiresAt,createdAt,now);
 return <div className={`chat-expiry expiry-timeline ${info.state==='active'&&info.urgent?'expiry-timeline--urgent':''}`} aria-live="off">
  {info.state==='active'&&info.fraction!==undefined?<svg viewBox="0 0 36 36" className="expiry-ring" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="2"/><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2" pathLength="100" strokeDasharray={`${info.fraction*100} 100`} transform="rotate(-90 18 18)"/></svg>:<Timer className="expiry-ring" aria-hidden="true"/>}
  <div><p className="code-font text-[9px] tracking-widest text-muted">{info.state==='active'?'EXPIRES IN':'SESSION EXPIRY'}</p><p className="code-font text-sm font-bold tabular-nums sm:text-lg" aria-label={info.state==='active'?`Room expires in ${info.label}`:info.label}>{info.label}</p></div>
 </div>;
};
