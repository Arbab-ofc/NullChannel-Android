import { io } from 'socket.io-client';
import { API_URL } from './constants';
import { configureMobileSocket, isNativeMobile, mobileAccessToken } from './mobile-auth';
/** Same Socket.IO server; account channel has no room-scoped guest identity. */
export const accountSocket = io(API_URL || undefined, {autoConnect:false,withCredentials:!isNativeMobile(),transports:['websocket'],auth:{}});
let reconnectTimer:ReturnType<typeof setTimeout>|null=null;
let reconnectAttempt=0;
let recovering=false;
const scheduleReconnect=()=>{
 if(!isNativeMobile()||reconnectTimer)return;
 const delay=Math.min(30000,500*2**Math.min(reconnectAttempt++,6));
 reconnectTimer=setTimeout(()=>{reconnectTimer=null;void recoverMobileSocket();},delay);
};
const recoverMobileSocket=async()=>{
 if(!isNativeMobile()||recovering)return;
 recovering=true;
 try{
  const token=await mobileAccessToken('account',true);
  if(token)connectAccountSocket();
 }catch{scheduleReconnect();}
 finally{recovering=false;}
};
export const connectAccountSocket=()=>{
 if(!isNativeMobile()){accountSocket.connect();return;}
 void configureMobileSocket(accountSocket).then(()=>{if((accountSocket.auth as {accountToken?:string}).accountToken)accountSocket.connect();}).catch(scheduleReconnect);
};
if(isNativeMobile()){
 accountSocket.on('connect',()=>{reconnectAttempt=0;if(reconnectTimer)clearTimeout(reconnectTimer);reconnectTimer=null;});
 accountSocket.on('disconnect',reason=>{if(reason==='io server disconnect')void recoverMobileSocket();});
 accountSocket.on('connect_error',()=>void recoverMobileSocket());
}
