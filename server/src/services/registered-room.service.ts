import { supabase } from '../config/supabase.js';
import { cleanupRoomsByIds } from './cleanup.service.js';
import { revokeRoomSockets } from '../sockets/emitter.js';
export async function deleteAccountRooms(accountId:string){
 const {data,error}=await supabase.from('nc_room_identities').select('room_id,sender_id,role').eq('account_id',accountId);if(error)throw error;
 const owned=(data??[]).filter(i=>i.role==='owner').map(i=>i.room_id);
 if(owned.length)await cleanupRoomsByIds(owned);
 for(const member of data??[]){if(member.role==='owner')continue;
  const {data:room,error:roomError}=await supabase.from('rooms').select('code').eq('id',member.room_id).maybeSingle();if(roomError)throw roomError;
  const {error:leaveError}=await supabase.from('room_members').update({left_at:new Date().toISOString()}).eq('room_id',member.room_id).eq('sender_id',member.sender_id);if(leaveError)throw leaveError;
  if(room)await revokeRoomSockets(member.room_id,room.code,member.sender_id);
 }
}
