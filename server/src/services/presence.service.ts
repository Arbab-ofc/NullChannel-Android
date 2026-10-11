import type {Server,Socket} from 'socket.io';
import {logger} from '../utils/logger.js';
import {supabase} from '../config/supabase.js';
import {verifyAccountCookie} from './account.service.js';
import {friendIds,blockedIds} from './social.service.js';
type Presence='online'|'away'|'invisible';
const connections=new Map<string,Map<string,{status:Presence,seen:number}>>();
let socketServer:Server|undefined;
export const visiblePresence=async(viewer:string,target:string,isFriend=false)=>{
 const {data,error}=await supabase.from('privacy_settings').select('presence_visibility').eq('user_id',target).single();if(error)throw error;
 if(data.presence_visibility==='nobody'||data.presence_visibility==='friends'&&!isFriend|| (await blockedIds(viewer)).includes(target))return 'offline';
 const tabs=connections.get(target);if(!tabs)return 'offline';const active=[...tabs.values()].filter(tab=>Date.now()-tab.seen<90000&&tab.status!=='invisible');
 return active.some(tab=>tab.status==='online')?'online':active.length?'away':'offline';
};
export const emitAccountEvent=(account:string,event:string,payload:unknown)=>socketServer?.to(`account:${account}`).emit(event,payload);
const broadcastPresence=async(account:string)=>{
 const friends=await friendIds(account);const profile=await supabase.from('profiles').select('username').eq('id',account).single();if(profile.error){if(profile.error.code==='PGRST116')return;throw profile.error;}if(!profile.data)return;
 for(const viewer of friends)emitAccountEvent(viewer,'presence:update',{username:profile.data.username,presence:await visiblePresence(viewer,account,true)});
};
export const refreshPresencePrivacy=async(account:string)=>{await broadcastPresence(account);};
const revokePresence=async(account:string)=>{const removed=await supabase.from('nc_presence').delete().eq('account_id',account);if(removed.error)throw removed.error;const canceled=await supabase.rpc('nc_match_cancel',{p_account:account});if(canceled.error)throw canceled.error;};
const lease=async(account:string)=>{
 const active=[...(connections.get(account)?.values()??[])].some(tab=>tab.status==='online'&&Date.now()-tab.seen<90000);
 if(!active){await revokePresence(account);return;}const {error}=await supabase.from('nc_presence').upsert({account_id:account,expires_at:new Date(Date.now()+90000).toISOString()});if(error)throw error;};
export const disconnectAccount=async(account:string)=>{
 const sockets=socketServer?await socketServer.in(`account:${account}`).fetchSockets():[];
 for(const socket of sockets)socket.disconnect(true);
 connections.delete(account);
 await revokePresence(account);
};
/** Call from the existing Socket.IO connection handler, after account authentication. */
export const attachAccountPresence=async(io:Server,socket:Socket,account:string)=>{
 socketServer=io;
 const tabs=connections.get(account)??new Map();tabs.set(socket.id,{status:tabs.values().next().value?.status??'online',seen:Date.now()});connections.set(account,tabs);
 let lastHeartbeat=0;
 const heartbeat=async(payload?:{status?:unknown})=>{
 const requestedStatus=payload?.status&&['online','away','invisible'].includes(String(payload.status));
 if(Date.now()-lastHeartbeat<5000&&!requestedStatus)return;lastHeartbeat=Date.now();
 try{const user=await verifyAccountCookie(socket.handshake.headers.cookie);if(!user||user.id!==account){socket.disconnect(true);return;}
 const current=connections.get(account)?.get(socket.id);if(!current)return;
 const previous=current.status;
 if(payload?.status&&['online','away','invisible'].includes(String(payload.status))){for(const tab of tabs.values())tab.status=payload.status as Presence;}
 current.seen=Date.now();await lease(account);if(previous!==current.status)await broadcastPresence(account);
 }catch{socket.emit('account:error',{code:'PRESENCE_UNAVAILABLE',message:'Presence is temporarily unavailable.'});}
 };
 socket.on('presence:heartbeat',heartbeat);socket.on('presence:set',heartbeat);
 const interval=setInterval(()=>{const current=connections.get(account)?.get(socket.id);if(!current||Date.now()-current.seen>=90000){socket.disconnect(true);}},30000);interval.unref();
 socket.once('disconnect',()=>{clearInterval(interval);void(async()=>{const current=connections.get(account);current?.delete(socket.id);if(current&&!current.size&&connections.get(account)===current){connections.delete(account);await revokePresence(account);}else if(current&&connections.get(account)===current){await lease(account);}await broadcastPresence(account);})().catch(()=>logger.error('presence_disconnect_cleanup_failed'));});
 // Install disconnect handling before any awaits: Socket.IO's connect event can
 // reach clients while this async setup is still joining rooms or writing leases.
 try{await Promise.all([socket.join(`account:${account}`),socket.join('registered-directory')]);await lease(account);await broadcastPresence(account);}catch(error){const current=connections.get(account);current?.delete(socket.id);if(current&&!current.size&&connections.get(account)===current){connections.delete(account);await revokePresence(account);}await socket.leave(`account:${account}`);socket.emit('account:error',{code:'PRESENCE_UNAVAILABLE',message:'Registered presence is unavailable. Check backend migrations and connectivity.'});socket.disconnect(true);throw error;}
};
export const cleanupSocialExpiry=async()=>{
 const now=new Date().toISOString();
 for(const table of ['friend_requests','account_notifications','nc_reports']){const {error}=await supabase.from(table).delete().lte('expires_at',now);if(error)throw error;}
};

export const createRoomExpirationWarnings=async()=>{const {data,error}=await supabase.rpc('nc_expiration_warnings');if(error)throw error;for(const row of data??[])emitAccountEvent(row.account_id,'notification:new',{type:'room_expiration'});return data?.length??0;};
