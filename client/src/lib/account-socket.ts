import { io } from 'socket.io-client';
import { API_URL } from './constants';
import { configureMobileSocket, isNativeMobile, mobileAccessToken } from './mobile-auth';
/** Same Socket.IO server; account channel has no room-scoped guest identity. */
export const accountSocket = io(API_URL || undefined, {autoConnect:false,withCredentials:!isNativeMobile(),transports:['websocket'],auth:{}});
export const connectAccountSocket=()=>{
 if(!isNativeMobile()){accountSocket.connect();return;}
 void configureMobileSocket(accountSocket).then(()=>{if((accountSocket.auth as {accountToken?:string}).accountToken)accountSocket.connect();}).catch(()=>undefined);
};
if(isNativeMobile()){
 const reconnect=()=>{void mobileAccessToken('account',true).then(token=>{if(token)connectAccountSocket();}).catch(()=>undefined);};
 accountSocket.on('disconnect',reason=>{if(reason!=='io client disconnect')reconnect();});
 accountSocket.on('connect_error',error=>{if(error.message==='SESSION_EXPIRED')reconnect();});
}
