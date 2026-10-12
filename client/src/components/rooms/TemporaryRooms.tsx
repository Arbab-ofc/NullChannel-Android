import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAccountList,sessionRemaining} from '../../pages/AccountPages';
import {Skeleton} from '../common/Skeleton';
import {Button} from '../common/Button';
export function TemporaryRooms(){const list=useAccountList('/registered/rooms');const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const rooms=list.data.map(i=>i.rooms as {code:string;room_name:string;room_kind:string;expires_at:string}).filter((r,index,all)=>r?.room_kind==='direct'&&Date.parse(r.expires_at)>now&&all.findIndex(x=>x.code===r.code)===index);
 return <section className="neo-panel mb-6 p-5" aria-label="Temporary Rooms"><h2 className="text-xl font-bold mb-4">Temporary Rooms</h2>{list.loading?<Skeleton label="Loading temporary rooms"/>:list.error?<div role="alert"><p>{list.error}</p><Button onClick={()=>void list.reload()}>Retry</Button></div>:!rooms.length?<p className="text-muted">No active temporary conversations.</p>:rooms.map(room=><Link key={room.code} to={`/chat/${room.code}`} className="block min-h-11 rounded-xl border border-accent/20 p-4 mb-3"><strong>{room.room_name}</strong><p className="text-sm text-muted">Active Temporary Chat</p><p className="text-sm" aria-live="off">{sessionRemaining(room.expires_at,now)}</p></Link>)}</section>;
}
