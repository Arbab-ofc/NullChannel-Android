import {useId} from 'react';
export function Illustration({kind='orbit',label,className=''}:{kind?:'orbit'|'error'|'success';label?:string;className?:string}){
 const id=useId().replaceAll(':','');
 return <svg className={`immersive-art immersive-art--${kind} ${className}`} viewBox="0 0 200 160" fill="none" role={label?'img':undefined} aria-label={label} aria-hidden={label?undefined:true}>
  <defs><linearGradient id={id} x1="20" y1="20" x2="180" y2="140" gradientUnits="userSpaceOnUse"><stop stopColor="hsl(var(--accent))"/><stop offset="1" stopColor="hsl(var(--cyan))"/></linearGradient></defs>
  <ellipse cx="100" cy="80" rx="85" ry="38" transform="rotate(-25 100 80)" stroke={`url(#${id})`} strokeOpacity=".4"/>
  <ellipse cx="100" cy="80" rx="85" ry="38" transform="rotate(25 100 80)" stroke="hsl(var(--text))" strokeOpacity=".15"/>
  <rect x="60" y="42" width="80" height="76" rx="24" fill="hsl(var(--panel))" stroke={`url(#${id})`} strokeWidth="2"/>
  {kind==='error'?<><path d="M80 67h8m24 0h8M84 97c9-10 23-10 32 0" stroke="hsl(var(--muted))" strokeWidth="3" strokeLinecap="round"/><path d="m133 32 12-10m-4 25 16-1" stroke="hsl(var(--punch))" strokeWidth="2" strokeLinecap="round"/></>:kind==='success'?<path className="success-check-path" d="m80 80 14 14 28-30" stroke="hsl(var(--success))" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>:<><path d="M77 64h46M77 78h34M77 92h22" stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round"/></>}
  <circle cx="26" cy="112" r="5" fill="hsl(var(--cyan))"/><circle cx="171" cy="46" r="4" fill="hsl(var(--accent))"/>
 </svg>;
}
