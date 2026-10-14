import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import type {Socket} from 'socket.io-client';
const bridge=vi.hoisted(()=>({addListener:vi.fn(async()=>({remove:async()=>undefined})),signalingStart:vi.fn(async()=>({roomCode:'TEST1234',callId:'fixture-call',phase:'outgoing',kind:'guest'})),signalingSnapshot:vi.fn(async()=>({})),signalingCommand:vi.fn(async()=>undefined)}));
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:()=> 'android',isNativePlatform:()=>true},registerPlugin:()=>bridge}));
import {NativeOwnedCall} from '../lib/native-owned-call';
import {dispatchNativeEvent} from '../lib/native-calls';
import {microphoneAvailable,releaseMicrophone} from '../lib/call-ownership';
const calls:NativeOwnedCall[]=[];
beforeEach(()=>vi.clearAllMocks());
afterEach(()=>{for(const call of calls.splice(0))call.dispose();releaseMicrophone('call:fixture-call');});
function call(){const socket={on:vi.fn(),emit:vi.fn(),off:vi.fn()} as unknown as Socket;const value=new NativeOwnedCall(socket,'TEST1234');calls.push(value);return {value,socket};}
describe('Android React observer ownership',()=>{
 it('delegates outgoing signaling to native without attaching JavaScript Socket.IO handlers',async()=>{const {value,socket}=call();value.attach();value.setJoinInfo('fixture-identity','Ghost');await value.invite();expect(bridge.signalingStart).toHaveBeenCalledWith(expect.objectContaining({roomCode:'TEST1234',senderId:'fixture-identity',kind:'guest'}));expect(socket.on).not.toHaveBeenCalled();expect(socket.emit).not.toHaveBeenCalled();expect(value.snapshot().phase).toBe('outgoing');});
 it('reattaches to healthy native media without creating another peer or invitation',async()=>{const {value}=call();value.attach();dispatchNativeEvent({type:'native-call',callId:'fixture-call',roomCode:'TEST1234',phase:'connected',connectedAt:123});expect(value.snapshot()).toMatchObject({callId:'fixture-call',phase:'connected',connectedAt:123});expect(microphoneAvailable()).toBe(false);expect(bridge.signalingStart).not.toHaveBeenCalled();dispatchNativeEvent({type:'native-call',callId:'fixture-call',roomCode:'TEST1234',phase:'ended'});expect(microphoneAvailable()).toBe(true);});
 it('routes answer decline and hangup to the authoritative native owner',async()=>{const {value,socket}=call();await value.accept();await value.reject();value.end();expect(bridge.signalingCommand.mock.calls).toEqual([[{action:'answer',callId:''}],[{action:'decline',callId:''}],[{action:'end',callId:''}]]);expect(socket.emit).not.toHaveBeenCalled();});
 it('keeps the incoming invitation visible when microphone permission is denied',async()=>{const {value}=call();value.adopt({roomCode:'TEST1234',callId:'fixture-call',phase:'incoming',ownershipId:'fixture-owner'});bridge.signalingCommand.mockRejectedValueOnce(new Error('Microphone permission denied'));await value.accept();expect(value.snapshot()).toMatchObject({phase:'incoming',accepting:false,message:'Microphone permission denied.'});expect(bridge.signalingCommand).toHaveBeenCalledWith({action:'answer',callId:'fixture-owner'});});
});
