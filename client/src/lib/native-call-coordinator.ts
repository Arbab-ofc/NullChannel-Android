import axios from 'axios';
import {NativeOwnedCall} from './native-owned-call';
import { io } from 'socket.io-client';
import { API_URL } from './constants';
import { nativeAndroid,nativeCalls,nativeOperation,listenNativeEvents,dispatchNativeEvent,type NativeEvent } from './native-calls';
import { mobileAccessToken, mobileSocketCredentials } from './mobile-auth';
import { accountSocket } from './account-socket';
import { api } from './api';
import { currentIdentity } from './session';
import { activeCallSnapshot,endAllCalls,roomVoiceCall,existingRoomCall,disposeUnownedCall } from './active-calls';
import { isolatedRoomSocket,connectRoomTransport,retainTransport,releaseTransport } from './socket';
import type { Invitation } from './voice-call';
const registrations=new Map<string,{deviceId:string;secret:string}>();
const invitations=new Map<string,Promise<void>>();
let guestGlobal:ReturnType<typeof io>|null=null;
let previousNetwork:string|null=null;
let initialized=false;
const cancelledInvitations=new Map<string,number>();
let registrationPending:Promise<void>|null=null;
function navigate(room:string){if(!/^[A-Z0-9]{8}$/.test(room))return;const path=`/chat/${room}`;if(window.location.pathname!==path){window.history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));}}
async function registerPush(){
 if(registrationPending)return registrationPending;
 registrationPending=(async()=>{for(const kind of ['guest','account'] as const){const token=await mobileAccessToken(kind);if(!token)continue;
  const native=await nativeCalls.registration({kind,baseUrl:API_URL});if(!native.configured)continue;
  await axios.put(`${API_URL}/api/mobile/push/devices`,{deviceId:native.deviceId,secret:native.secret,token:native.token},{withCredentials:false,timeout:5000,headers:{Authorization:`Bearer ${token}`}});registrations.set(kind,{deviceId:native.deviceId,secret:native.secret});
 }})().finally(()=>registrationPending=null);return registrationPending;
}
export async function revokeNativeCalling(kind?:'guest'|'account'){
 if(!nativeAndroid())return;
 if(!kind)endAllCalls();else if(activeCallSnapshot()?.sessionKind===kind)activeCallSnapshot()?.end();
 for(const [scope,record] of registrations)if(!kind||kind===scope)await axios.delete(`${API_URL}/api/mobile/push/devices/${record.deviceId}`,{withCredentials:false,timeout:3000,headers:{'X-NC-Device-Secret':record.secret}}).catch(()=>undefined);
 if(kind){registrations.delete(kind);if(kind==='guest')guestGlobal?.disconnect();await nativeCalls.clearSession({kind});}else{registrations.clear();guestGlobal?.disconnect();await nativeCalls.clear();}
}
async function incoming(payload:Invitation,answer=false){
 if(cancelledInvitations.has(payload.callId))return;
 if(!/^[A-Z0-9]{8}$/.test(payload.roomCode)||payload.expiresAt&&payload.expiresAt<=Date.now())return;
 const existing=activeCallSnapshot();if(existing?.snapshot().callId===payload.callId){if(answer){navigate(payload.roomCode);await existing.accept();}return;}
 const running=invitations.get(payload.callId);if(running){await running;if(answer)await activeCallSnapshot()?.accept();return;}
 const work=(async()=>{
  const verified=await api.get(`/rooms/${payload.roomCode}/calls/${payload.callId}/invitation`,{timeout:5000});const invitation=verified.data.data as Invitation;
  if(invitation.expiresAt&&invitation.expiresAt<=Date.now())return;
  const call=existingRoomCall(payload.roomCode)??roomVoiceCall(isolatedRoomSocket(payload.roomCode),payload.roomCode);call.attach();
  const room=(await api.get(`/rooms/${payload.roomCode}`,{timeout:5000})).data.data;
  const senderId=room.self_sender_id??currentIdentity(),senderName=room.self_sender_name??sessionStorage.getItem(`nullchannel_name_${payload.roomCode}`)??'Anonymous';
  call.setJoinInfo(senderId,senderName,room.room_kind&&room.room_kind!=='guest'?'account':'guest');call.setRoom(true,room.expires_at);
  const owner=`invitation:${payload.callId}`;retainTransport(call.signalingSocket,owner);
  try{await new Promise<void>((resolve,reject)=>{
    const socket=call.signalingSocket;const timeout=setTimeout(()=>{cleanup();reject(new Error('Invitation room join timed out.'));},7000);
    const cleanup=()=>{clearTimeout(timeout);socket.off('connect',join);socket.off('room-joined',joined);};
    const join=()=>socket.emit('join-room',{roomCode:payload.roomCode,senderId,senderName});
    const joined=(value:{code:string})=>{if(value.code===payload.roomCode){cleanup();resolve();}};
    socket.on('connect',join);socket.on('room-joined',joined);if(socket.connected)join();else connectRoomTransport(socket);
  });
  // The invitation was authenticated by the endpoint; deliver it into the same
  // room-owned state machine used by the ordinary Socket.IO incoming path.
  if(cancelledInvitations.has(payload.callId)||invitation.expiresAt&&invitation.expiresAt<=Date.now())return;
  call.receiveInvitation(invitation);
  if(answer){navigate(payload.roomCode);await call.accept();}
  }finally{releaseTransport(call.signalingSocket,owner);disposeUnownedCall(call);}
 })().catch(()=>{nativeOperation('expired-invitation',nativeCalls.tone({tone:'stop',callId:payload.callId,cancelNotification:true}));});
 invitations.set(payload.callId,work);try{await work;}finally{invitations.delete(payload.callId);}
}
async function nativeEvent(event:NativeEvent){
 if(event.type==='native-call'&&event.roomCode){const call=existingRoomCall(event.roomCode)??roomVoiceCall(isolatedRoomSocket(event.roomCode),event.roomCode);call.attach();if(call instanceof NativeOwnedCall)call.adopt(event as unknown as Record<string,unknown>);return;}
 if(event.type==='session-ended'){await revokeNativeCalling(event.kind);return;}
 const call=activeCallSnapshot();
 if(event.type==='ended'&&event.callId&&!activeCallSnapshot())nativeOperation('ended-tone',nativeCalls.tone({tone:'ended',callId:event.callId,durationMs:500,cancelNotification:true}));
 if(event.type==='diagnostic')console.info('voice_diagnostic',{protocol:event.protocol,relay:event.relay,packetsLost:event.packetsLost,packetsReceived:event.packetsReceived,iceErrorCode:event.iceErrorCode});
 if(event.type==='incoming'&&event.callId&&event.roomCode)await incoming({callId:event.callId,roomCode:event.roomCode,peerName:event.peerName??'Anonymous caller',roomName:event.roomName??'NullChannel',expiresAt:event.expiresAt,protocol:2});
 if(event.type==='token')await registerPush().catch(()=>console.warn('push_registration_unavailable'));
 if(event.type==='network'){const next=`${event.online}:${event.transport}`;if(previousNetwork!==null&&previousNetwork!==next)call?.networkChanged(event.online===true);previousNetwork=next;}
 if(event.type==='routes'&&event.selected)call?.setAudioRoutes(event.routes??[],event.selected);
 if(event.type==='focus')call?.audioInterrupted(event.available===true);
 if(event.type==='action'&&event.roomCode){
  if(event.action==='open'&&activeCallSnapshot()?.snapshot().callId===event.callId){navigate(event.roomCode);return;}
  if(event.callId)await incoming({callId:event.callId,roomCode:event.roomCode,peerName:'Anonymous caller',roomName:'NullChannel'},event.action==='answer');
  else navigate(event.roomCode);
 }
}
export async function initializeNativeCalling(){
 if(!nativeAndroid()||initialized)return;initialized=true;
 await listenNativeEvents(event=>{void nativeEvent(event);});
 const status=await nativeCalls.initialize();
 if(!status.notificationsGranted)await nativeCalls.notificationPermission();
 if(status.signaling?.callId&&status.signaling.roomCode){const code=String(status.signaling.roomCode);const call=existingRoomCall(code)??roomVoiceCall(isolatedRoomSocket(code),code);call.attach();if(call instanceof NativeOwnedCall)call.adopt(status.signaling);}
 else if(status.media.callId){
  // Reconcile process-owned native media before reconnecting its room transport.
  try{
   const {roomCode,callId,state}=status.media;
   const data=(await api.get(`/rooms/${roomCode}/calls/${callId}/state`,{timeout:5000})).data.data;
   const room=(await api.get(`/rooms/${roomCode}`,{timeout:5000})).data.data;
   const call=existingRoomCall(roomCode)??roomVoiceCall(isolatedRoomSocket(roomCode),roomCode);const peer=call.signalingSocket;call.attach();
   const senderId=room.self_sender_id??currentIdentity(),senderName=room.self_sender_name??sessionStorage.getItem(`nullchannel_name_${roomCode}`)??'Anonymous';call.setJoinInfo(senderId,senderName,room.room_kind&&room.room_kind!=='guest'?'account':'guest');
   const owner=`restore:${callId}`;retainTransport(peer,owner);
   try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('Restore timed out.'));},7000);const join=()=>peer.emit('join-room',{roomCode,senderId,senderName});const joined=(value:{code:string})=>{if(value.code===roomCode){cleanup();resolve();}};const cleanup=()=>{clearTimeout(timer);peer.off('connect',join);peer.off('room-joined',joined);};peer.on('connect',join);peer.on('room-joined',joined);if(peer.connected)join();else connectRoomTransport(peer);});
   await call.restoreNative(callId,data.role==='caller',data.snapshot,data.peerName,data.roomName,state==='connected');call.setRoom(true,room.expires_at);}finally{releaseTransport(peer,owner);disposeUnownedCall(call);}
  }catch{await nativeCalls.end({callId:status.media.callId});}
 }
 void registerPush().catch(()=>console.warn('push_registration_unavailable'));
 const cancelled=(payload:{callId:string;roomCode:string})=>{for(const [id,expires] of cancelledInvitations)if(expires<Date.now())cancelledInvitations.delete(id);if(cancelledInvitations.size>=256)cancelledInvitations.delete(cancelledInvitations.keys().next().value!);cancelledInvitations.set(payload.callId,Date.now()+60000);if(activeCallSnapshot()?.snapshot().callId===payload.callId)activeCallSnapshot()?.end();nativeOperation('cancel-invitation',nativeCalls.show({kind:'call-ended',eventId:`end:${payload.callId}`,callId:payload.callId,roomCode:payload.roomCode,expiresAt:Date.now()+60000}));};
 const notification=(payload:Record<string,unknown>)=>nativeOperation('message-notification',nativeCalls.show(payload));
 accountSocket.on('native:notification',notification);
 accountSocket.on('call:ended',cancelled);accountSocket.on('call:timeout',cancelled);accountSocket.on('call:rejected',cancelled);
 accountSocket.on('call:invitation' ,(payload:Invitation)=>{void incoming(payload);});
 guestGlobal=io(API_URL,{autoConnect:false,withCredentials:false,transports:['websocket'],reconnection:true});
 const connectGuest=async()=>{const credentials=await mobileSocketCredentials();guestGlobal!.auth={guestToken:credentials.guestToken,globalCalls:true};if(credentials.guestToken)guestGlobal!.connect();};
 guestGlobal.on('native:notification',notification);
 guestGlobal.on('call:ended',cancelled);guestGlobal.on('call:timeout',cancelled);guestGlobal.on('call:rejected',cancelled);
 guestGlobal.on('call:invitation',(payload:Invitation)=>{void incoming(payload);});
 guestGlobal.on('connect_error',()=>{console.warn('global_call_channel_unavailable');});
 guestGlobal.on('disconnect',reason=>{if(reason==='io server disconnect')void connectGuest().catch(()=>undefined);});
 await connectGuest();
 window.addEventListener('nullchannel-app-resume',()=>{if(!guestGlobal?.connected)void connectGuest();void registerPush().catch(()=>undefined);void nativeCalls.drain().then(async value=>{for(const event of value.events)dispatchNativeEvent(event);if(value.action?.roomCode)await nativeEvent({...value.action,type:'action'});});});
 window.addEventListener('nullchannel-mobile-session-ended',event=>{const kind=(event as CustomEvent<{kind:'guest'|'account'}>).detail.kind;void revokeNativeCalling(kind);});
 window.addEventListener('nullchannel-account-expired',()=>{void revokeNativeCalling('account');});
 window.addEventListener('nullchannel-mobile-session-changed',()=>{if(!guestGlobal?.connected)void connectGuest();void registerPush().catch(()=>undefined);});
 const pending=await nativeCalls.drain();for(const event of pending.events)dispatchNativeEvent(event);if(pending.action?.roomCode)await nativeEvent({...pending.action,type:'action'});
}
export function updateNativeChatContext(roomCode:string){if(nativeAndroid())nativeOperation('chat-context',nativeCalls.context({roomCode,clear:!!roomCode}));}
