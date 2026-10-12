export function roomAtmosphere(room:{room_type?:string;room_kind?:string}) {
  if(room.room_kind==='match')return 'monochrome';
  if(room.room_kind==='direct')return 'fading';
  if(room.room_kind && !['guest','group','public'].includes(room.room_kind))return 'neutral';
  if(room.room_type==='group'||['group','public'].includes(room.room_kind??''))return 'blue';
  if(room.room_type==='private')return 'violet';
  return 'neutral';
}
export function expiryInfo(expiresAt?:string|null,createdAt?:string|null,now=Date.now()){
 if(expiresAt===null)return {state:'unscheduled' as const,label:'No scheduled expiry'};
 const deadline=expiresAt?Date.parse(expiresAt):NaN;
 if(!Number.isFinite(deadline))return {state:'unavailable' as const,label:'Expiry unavailable'};
 const remaining=Math.max(0,deadline-now);
 if(remaining===0)return {state:'expired' as const,label:'Expired',remaining};
 const seconds=Math.ceil(remaining/1000),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
 const start=createdAt?Date.parse(createdAt):NaN;
 const fraction=Number.isFinite(start)&&start<=now&&deadline>start?Math.max(0,Math.min(1,remaining/(deadline-start))):undefined;
 return {state:'active' as const,label:[h,m,s].map(value=>String(value).padStart(2,'0')).join(':'),remaining,fraction,urgent:remaining<=300000};
}
