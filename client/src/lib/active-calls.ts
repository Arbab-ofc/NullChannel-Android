import {NativeOwnedCall} from './native-owned-call';
import {nativeAndroid} from './native-calls';
import {retainTransport,releaseTransport} from './socket';
import {microphoneAvailable} from './call-ownership';
import type {Socket} from 'socket.io-client';
import {VoiceCall,callIsActive} from './voice-call';
const users=new Map<VoiceCall,number>();
const calls=new Map<string,VoiceCall>();const listeners=new Set<()=>void>();
export const subscribeActiveCalls=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const activeCallSnapshot=()=>[...calls.values()].find(call=>callIsActive(call.snapshot().phase))??null;
export const hasActiveCall=()=>activeCallSnapshot()!==null;
export function roomVoiceCall(socket:Socket,code:string){
 let call=calls.get(code);if(!call){call=nativeAndroid()?new NativeOwnedCall(socket,code):new VoiceCall(socket,code);calls.set(code,call);const own=call;own.guard=()=>microphoneAvailable(`call:${own.snapshot().callId}`)&&![...calls.values()].some(other=>other!==own&&callIsActive(other.snapshot().phase));let ownsTransport=false;call.subscribe(()=>{const active=callIsActive(own.snapshot().phase);if(active&&!ownsTransport&&!nativeAndroid()){retainTransport(own.signalingSocket,`call:${own.roomCode}`);ownsTransport=true;}else if(!active&&ownsTransport){ownsTransport=false;releaseTransport(own.signalingSocket,`call:${own.roomCode}`);}for(const fn of listeners)fn();if(!callIsActive(own.snapshot().phase)&&calls.get(code)===own){if(!users.get(own)){own.dispose();calls.delete(code);users.delete(own);}}});}
 return call;
}
export function retainRoomCall(call:VoiceCall){users.set(call,(users.get(call)??0)+1);calls.set(call.roomCode,call);}
export function releaseRoomCall(call:VoiceCall){const count=Math.max(0,(users.get(call)??1)-1);users.set(call,count);if(!count&&!callIsActive(call.snapshot().phase)){call.dispose();calls.delete(call.roomCode);users.delete(call);}}

export function endAllCalls(){for(const call of [...calls.values()])call.end();}

export const existingRoomCall=(code:string)=>calls.get(code.toUpperCase());
export function disposeUnownedCall(call:VoiceCall){if(!users.get(call)&&!callIsActive(call.snapshot().phase)){call.dispose();if(calls.get(call.roomCode)===call)calls.delete(call.roomCode);users.delete(call);}}
