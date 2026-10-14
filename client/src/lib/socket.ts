import { io } from 'socket.io-client';
import { API_URL } from './constants';
import {accountApi} from './account';
import { ensureSession } from './session';
import { configureMobileSocket, isNativeMobile } from './mobile-auth';
export const socket = io(API_URL || undefined, { autoConnect: false, reconnection: true, withCredentials: !isNativeMobile(), transports: ['websocket'] });
let renewing = false;
let desired = false;let retry:ReturnType<typeof setTimeout>|null=null;let attempts=0;
const retryHandshake=()=>{if(!desired||retry)return;const delay=Math.min(30000,500*2**Math.min(attempts++,6));retry=setTimeout(()=>{retry=null;if(!desired)return;if(isNativeMobile())void configureMobileSocket(socket,String((socket.auth as {roomCode?:string}).roomCode??'')).then(()=>socket.connect()).catch(retryHandshake);else socket.connect();},delay);};
export const connectSocket = () => { desired = true;if(isNativeMobile())void configureMobileSocket(socket,String((socket.auth as {roomCode?:string}).roomCode??'')).then(()=>{if(desired)socket.connect();}).catch(()=>retryHandshake());else socket.connect(); };
export const disconnectSocket = () => { desired = false;if(retry)clearTimeout(retry);retry=null; socket.disconnect();roomsByCode.clear();for(const [peer,control] of roomTransports){control.disconnect();roomTransports.delete(peer);} };
const renew = async () => {
  if (renewing || !desired) return;
  renewing = true;
  try { if(socket.auth&&'roomCode' in socket.auth){try{await accountApi.get('/account/me');}catch{/* Guest rooms continue through anonymous session validation. */}}await ensureSession();if(isNativeMobile())await configureMobileSocket(socket,String((socket.auth as {roomCode?:string}).roomCode??''),true); if (desired) socket.connect(); }
  catch {retryHandshake();}
  finally { renewing = false; }
};
socket.on('connect_error', error => {
  if(error.message==='SESSION_EXPIRED')void renew();else if(error.message!=='JOIN_REQUIRED')retryHandshake();
});
socket.on('connect',()=>{attempts=0;if(retry)clearTimeout(retry);retry=null;});
socket.on('disconnect', reason => { if (reason === 'io server disconnect') void renew(); });

// A second room must not mutate the transport carrying an existing call.
const roomsByCode=new Map<string,ReturnType<typeof io>>();
const roomTransports=new Map<ReturnType<typeof io>,{connect:()=>void;disconnect:()=>void}>();
export function isolatedRoomSocket(roomCode:string){
 const key=roomCode.toUpperCase(),existing=roomsByCode.get(key);if(existing)return existing;
 const peer=io(API_URL||undefined,{autoConnect:false,reconnection:true,withCredentials:!isNativeMobile(),transports:['websocket'],auth:{roomCode}});let wanted=false,renewing=false;let retries=0,timer:ReturnType<typeof setTimeout>|null=null;const retry=()=>{if(!wanted||timer)return;const delay=Math.min(30000,500*2**Math.min(retries++,6));timer=setTimeout(()=>{timer=null;if(!wanted)return;if(isNativeMobile())void configureMobileSocket(peer,key).then(()=>peer.connect()).catch(retry);else peer.connect();},delay);};
 const renew=async()=>{if(renewing||!wanted)return;renewing=true;try{try{await accountApi.get('/account/me');}catch{/* Guest room validation remains separate. */}await ensureSession();if(isNativeMobile())await configureMobileSocket(peer,key,true);if(wanted)peer.connect();}catch{retry();}finally{renewing=false;}};
 peer.on('connect_error',error=>{if(error.message==='SESSION_EXPIRED')void renew();else if(error.message!=='JOIN_REQUIRED')retry();});peer.on('connect',()=>{retries=0;if(timer)clearTimeout(timer);timer=null;});peer.on('disconnect',reason=>{if(reason==='io server disconnect')void renew().catch(()=>undefined);});
 roomsByCode.set(key,peer);roomTransports.set(peer,{connect:()=>{wanted=true;if(isNativeMobile())void configureMobileSocket(peer,key).then(()=>{if(wanted)peer.connect();}).catch(retry);else peer.connect();},disconnect:()=>{wanted=false;if(timer)clearTimeout(timer);timer=null;peer.disconnect();}});return peer;
}
export function connectRoomTransport(peer:ReturnType<typeof io>){if(peer===socket)connectSocket();else roomTransports.get(peer)?.connect();}
export function disconnectRoomTransport(peer:ReturnType<typeof io>){if(peer===socket){desired=false;if(retry)clearTimeout(retry);retry=null;peer.disconnect();}else{roomTransports.get(peer)?.disconnect();roomTransports.delete(peer);for(const [code,entry] of roomsByCode)if(entry===peer)roomsByCode.delete(code);}}

const transportOwners=new Map<ReturnType<typeof io>,Set<string>>();
export function retainTransport(peer:ReturnType<typeof io>,owner:string){const set=transportOwners.get(peer)??new Set<string>();set.add(owner);transportOwners.set(peer,set);}
export function releaseTransport(peer:ReturnType<typeof io>,owner:string){const set=transportOwners.get(peer);if(!set)return;set.delete(owner);if(!set.size){transportOwners.delete(peer);disconnectRoomTransport(peer);}}
