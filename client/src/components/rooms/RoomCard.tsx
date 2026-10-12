import {ArrowUpRight,Timer,LockKeyhole,UsersRound} from 'lucide-react';
import {roomAtmosphere} from '../../lib/room-presentation';
export type RoomCardData={code:string;room_name:string;room_type?:string;room_kind?:string;expires_at?:string|null};
/** No history request, inferred member count or fabricated metadata. */
export function RoomCard({room,open}:{room:RoomCardData;open:(code:string)=>void}){
 const type=room.room_kind==='match'?'Anonymous match':room.room_kind==='direct'?'Temporary direct room':room.room_kind==='public'?'Public room':room.room_type==='private'?'Private room':room.room_type==='group'||room.room_kind==='group'?'Group room':'Room';
 const expiry=room.expires_at?new Date(room.expires_at):null;
 const valid=expiry&&Number.isFinite(expiry.getTime());const Icon=room.room_type==='private'?LockKeyhole:UsersRound;
 return <button type="button" className="space-room dynamic-room-card" data-atmosphere={roomAtmosphere(room)} onClick={()=>open(room.code)}>
  <span className="space-room__identity"><span className="room-card-type"><Icon aria-hidden="true"/>{type}</span><span className="space-room__name">{room.room_name}</span><span className="room-card-meta"><span className="space-room__code code-font">{room.code}</span>{valid&&<time dateTime={room.expires_at!} title={expiry.toLocaleString()}><Timer aria-hidden="true"/>Ends {expiry.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>}</span></span><ArrowUpRight aria-hidden="true"/>
 </button>;
}
