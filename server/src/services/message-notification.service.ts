import {env} from '../config/env.js';
import type { Server } from 'socket.io';
import { supabase } from '../config/supabase.js';
import { socketSessionValid } from '../sockets/auth.js';
import { getParticipantsForRoom } from './membership.service.js';
export async function messageSocketNotifications(io:Server,room:{id:string;code:string;room_kind?:string},sender:string,event:{eventId:string;expiresAt:number}){
 const members=await getParticipantsForRoom(room.id);const identities=new Set(members.filter(member=>member.sender_id!==sender).map(member=>member.sender_id));
 const accounts=new Set<string>();
 if(room.room_kind&&room.room_kind!=='guest'){const {data,error}=await supabase.from('nc_room_identities').select('account_id,sender_id').eq('room_id',room.id);if(error)throw error;for(const row of data??[])if(identities.has(row.sender_id))accounts.add(row.account_id);}
 for(const peer of io.sockets.sockets.values())if(peer.connected&&peer.handshake.headers.origin===env.MOBILE_APP_ORIGIN&&(peer.data.globalCalls&&identities.has(peer.data.identity)||peer.data.socialOnly&&accounts.has(peer.data.accountId))&&await socketSessionValid(peer))peer.emit('native:notification',{kind:'message',roomCode:room.code,...event});
}
