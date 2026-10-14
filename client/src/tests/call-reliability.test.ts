// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {VoiceCall} from '../lib/voice-call';
import {acquireMicrophone,releaseMicrophone,microphoneAvailable} from '../lib/call-ownership';
import type {Socket} from 'socket.io-client';
import {fetchIceLease} from '../lib/ice-lease';
vi.mock('../lib/api',()=>({api:{get:vi.fn()}}));
import {api} from '../lib/api';
function signaling(){const listeners=new Map<string,(data:unknown)=>void>();const acknowledgments:Array<(error:null,result:object)=>void>=[];const emit=vi.fn((_event:string,_data:object,ack:(error:null,result:object)=>void)=>{acknowledgments.push(ack);});const socket={connected:true,on:(event:string,fn:(data:unknown)=>void)=>listeners.set(event,fn),off:(event:string)=>listeners.delete(event),timeout:()=>({emit})} as unknown as Socket;return {socket,listeners,emit,acknowledgments};}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();releaseMicrophone('recording');releaseMicrophone('call');});
describe('call ownership and credential recovery',()=>{
 it('enforces one microphone owner and never lets another owner release it',()=>{expect(acquireMicrophone('recording')).toBe(true);expect(acquireMicrophone('call')).toBe(false);releaseMicrophone('call');expect(microphoneAvailable()).toBe(false);releaseMicrophone('recording');expect(acquireMicrophone('call')).toBe(true);});
 it('tracks authenticated TURN expiration, uses a bounded request and propagates cancellation',async()=>{vi.mocked(api.get).mockResolvedValueOnce({data:{data:{expiresAt:1800000000,iceServers:[{urls:'turn:relay.example:3478',username:'temporary',credential:'fixture'}]}}});const lease=await fetchIceLease('TEST1234');expect(lease.expiresAt).toBe(1800000000000);expect(lease.relay).toBe(true);expect(api.get).toHaveBeenCalledWith('/rooms/TEST1234/calls/ice-servers',expect.objectContaining({timeout:5000}));const abort=new AbortController();abort.abort();vi.mocked(api.get).mockRejectedValueOnce(new Error('cancelled'));await expect(fetchIceLease('TEST1234',abort.signal)).rejects.toThrow('cancelled');});
 it('does not let an INVALID_CALL acknowledgment from an old invitation terminate a new one',async()=>{
  const s=signaling(),call=new VoiceCall(s.socket,'TEST1234');call.attach();const first=call.invite();call.end();call.dismiss();const second=call.invite();
  s.acknowledgments[0](null,{ok:false,code:'INVALID_CALL'});await first;expect(call.snapshot().phase).toBe('outgoing');s.acknowledgments[1](null,{ok:true});await second;call.dispose();
 });
 it('does not attach duplicate handlers and ignores expired invitations',()=>{const s=signaling(),call=new VoiceCall(s.socket,'TEST1234');call.attach();const count=s.listeners.size;call.attach();expect(s.listeners.size).toBe(count);s.listeners.get('call:incoming')?.({roomCode:'TEST1234',callId:'expired',expiresAt:Date.now()-1});expect(call.snapshot().phase).toBe('idle');call.dispose();});
});
