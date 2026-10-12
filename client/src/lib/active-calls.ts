import type {Socket} from 'socket.io-client';
import {VoiceCall,callIsActive} from './voice-call';
const users=new Map<VoiceCall,number>();
const calls=new Map<string,VoiceCall>();const listeners=new Set<()=>void>();
export const subscribeActiveCalls=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const activeCallSnapshot=()=>[...calls.values()].find(call=>callIsActive(call.snapshot().phase))??null;
export const hasActiveCall=()=>activeCallSnapshot()!==null;
export function roomVoiceCall(socket:Socket,code:string){
 let call=calls.get(code);if(!call){call=new VoiceCall(socket,code);calls.set(code,call);const own=call;call.subscribe(()=>{for(const fn of listeners)fn();if(!callIsActive(own.snapshot().phase)&&calls.get(code)===own){if(!users.get(own)){own.dispose();calls.delete(code);users.delete(own);}}});}
 return call;
}
export function retainRoomCall(call:VoiceCall){users.set(call,(users.get(call)??0)+1);calls.set(call.roomCode,call);}
export function releaseRoomCall(call:VoiceCall){const count=Math.max(0,(users.get(call)??1)-1);users.set(call,count);if(!count&&!callIsActive(call.snapshot().phase)){call.dispose();calls.delete(call.roomCode);users.delete(call);}}
