import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AudioCallbacks, CallPeer } from './webrtc';
export type NativeEvent = {type:string;callId?:string;roomCode?:string;action?:string;state?:string;revision?:number;candidate?:RTCIceCandidateInit;online?:boolean;transport?:string;routes?:Array<{id:string;label:string}>;selected?:string;available?:boolean;permanentLoss?:boolean;protocol?:string;relay?:boolean;packetsLost?:number;packetsReceived?:number;iceErrorCode?:number;phase?:string;ownershipId?:string;accepting?:boolean;kind?:'guest'|'account';muted?:boolean;connectedAt?:number;message?:string;peerName?:string;roomName?:string;expiresAt?:number};
type Registration={configured:boolean;deviceId:string;secret:string;token:string;baseUrl:string};
export type NativeMedia={callId:string;roomCode:string;state:string;revision:number};
type NativeCallsApi={
 microphoneLease(options:{owner:string;acquire:boolean}):Promise<{granted:boolean}>;
 signalingStart(options:Record<string,unknown>):Promise<Record<string,unknown>>;signalingSnapshot():Promise<Record<string,unknown>>;signalingCommand(options:{action:string;callId?:string}):Promise<void>;showCallUI(options:{callId:string}):Promise<void>;
 addListener(event:'event',handler:(event:NativeEvent)=>void):Promise<PluginListenerHandle>;
 initialize():Promise<{firebaseConfigured:boolean;notificationsGranted:boolean;media:NativeMedia;signaling?:Record<string,unknown>}>;
 drain():Promise<{events:NativeEvent[];action?:NativeEvent;media:NativeMedia;signaling?:Record<string,unknown>}>;
 notificationPermission():Promise<{granted:boolean}>;bluetoothPermission():Promise<{granted:boolean}>;
 registration(options:{kind:'guest'|'account';baseUrl:string}):Promise<Registration>;
 context(options:{roomCode:string;clear?:boolean}):Promise<void>;
 show(options:Record<string,unknown>):Promise<void>;
 tone(options:{tone:string;callId:string;durationMs?:number;cancelNotification?:boolean}):Promise<void>;
 start(options:{callId:string;roomCode:string;iceServers:RTCIceServer[];connectMs?:number;disconnectMs?:number}):Promise<void>;
 offer(options:{callId:string;revision:number;restart:boolean}):Promise<{sdp:string}>;
 description(options:{callId:string;kind:'offer'|'answer';revision:number;sdp:string}):Promise<{sdp:string}>;
 candidate(options:{callId:string;candidate:RTCIceCandidateInit}):Promise<void>;
 configure(options:{callId:string;iceServers:RTCIceServer[]}):Promise<void>;
 mute(options:{muted:boolean}):Promise<void>;end(options:{callId:string}):Promise<void>;
 routes(options:{route?:string}):Promise<{routes:Array<{id:string;label:string}>;selected:string}>;
 clear():Promise<void>;clearSession(options:{kind:'guest'|'account'}):Promise<void>;
};
export const nativeCalls=registerPlugin<NativeCallsApi>('NativeCalls');
const eventConsumers=new Set<(event:NativeEvent)=>void>();
let eventBridge:Promise<PluginListenerHandle>|null=null;
export const dispatchNativeEvent=(event:NativeEvent)=>{for(const consumer of eventConsumers)consumer(event);};
export async function listenNativeEvents(consumer:(event:NativeEvent)=>void):Promise<PluginListenerHandle>{eventConsumers.add(consumer);if(!eventBridge)eventBridge=nativeCalls.addListener('event',dispatchNativeEvent).catch(error=>{eventBridge=null;throw error;});try{await eventBridge;}catch(error){eventConsumers.delete(consumer);throw error;}return {remove:async()=>{eventConsumers.delete(consumer);}};}
export const nativeAndroid=()=>Capacitor.getPlatform()==='android';
export function nativeOperation(operation:string,work:Promise<unknown>){void work.catch(()=>console.warn('native_call_operation_failed',{operation}));}
export class NativeAudioPeer implements CallPeer {
 private ready:Promise<void>|null=null;
 private closed=false;
 private listener:PluginListenerHandle|null=null;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private retryTimer:ReturnType<typeof setTimeout>|null=null;
 private revision=0;
 private remoteRevision=0;
 private acknowledged=0;
 private queued: Array<{revision:number;candidate:RTCIceCandidateInit}>=[];
 private local: Array<{revision:number;candidate:RTCIceCandidateInit}>=[];
 private chain=Promise.resolve();
 private retries=0;
 private recovering=false;
 private _connected=false;
 private muted=false;
 constructor(private id:string,private room:string,private caller:boolean,private callbacks:AudioCallbacks,private config:RTCConfiguration,private timeouts:{connectMs:number;disconnectMs:number},initial?:{revision:number;connected:boolean}){if(initial){this.revision=initial.revision;this.remoteRevision=initial.revision;this.acknowledged=initial.revision;this._connected=initial.connected;}}
 get connected(){return this._connected;}
 start(){if(!this.ready)this.ready=this.initialize();return this.ready;}
 private async initialize(){
  this.listener=await listenNativeEvents(event=>{if(this.closed||event.callId!==this.id)return;
   if(event.type==='candidate'&&event.candidate){if(this.local.length>=256)return this.fail('Too many voice candidates.');if(this.acknowledged===event.revision)void this.callbacks.candidate(event.revision!,event.candidate).catch(()=>this.fail('Voice signaling interrupted.'));else this.local.push({revision:event.revision!,candidate:event.candidate});}
   if(event.type==='state'&&event.state==='connected'){this._connected=true;this.recovering=false;this.retries=0;this.clearTimer();this.callbacks.state('connected');}
   if(event.type==='state'&&event.state==='reconnecting'){this._connected=false;this.reconnect();}
   if(event.type==='ended')this.fail('Native call ended.');
  });
  if(this.closed){await this.listener.remove();return;}
  try{await nativeCalls.start({callId:this.id,roomCode:this.room,iceServers:this.config.iceServers??[],connectMs:this.timeouts.connectMs,disconnectMs:this.timeouts.disconnectMs});if(this.closed){await nativeCalls.end({callId:this.id});return;}if(this.connected){await nativeCalls.configure({callId:this.id,iceServers:this.config.iceServers??[]});this.callbacks.state('connected');}else this.deadline(this.timeouts.connectMs);}
  catch(error){this.close();throw error;}
 }
 private clearTimer(){if(this.timer)clearTimeout(this.timer);this.timer=null;}
 private deadline(ms:number){this.clearTimer();this.timer=setTimeout(()=>this.fail('Voice connection timed out.'),ms);}
 private fail(message:string){if(this.closed)return;this.close();this.callbacks.error(message);}
 private serialize(work:()=>Promise<void>){const next=this.chain.catch(()=>undefined).then(work);this.chain=next;return next;}
 async offer(restart=false){return this.serialize(async()=>{
  await this.start();if(this.closed)return;
  if(restart){const config=await this.callbacks.restart?.();if(config===false||this.revision!==this.remoteRevision)return;if(config)await this.configure(config);}
  this.revision++;this.acknowledged=0;
  const {sdp}=await nativeCalls.offer({callId:this.id,revision:this.revision,restart});if(this.closed)return;
  await this.callbacks.description('offer',this.revision,sdp);await this.flush();
 });}
 async description(kind:'offer'|'answer',revision:number,sdp:string){return this.serialize(async()=>{
  if(this.closed||revision<=this.remoteRevision)return;
  if(kind==='offer'&&this.caller||kind==='answer'&&!this.caller||revision>(this.revision+1))throw new Error('Invalid native negotiation role or revision.');
  await this.start();if(this.closed)return;this.revision=revision;
  const result=await nativeCalls.description({callId:this.id,kind,revision,sdp});this.remoteRevision=revision;
  const apply=this.queued.filter(item=>item.revision<=revision);this.queued=this.queued.filter(item=>item.revision>revision);
  for(const queued of apply)if(queued.revision===revision)await nativeCalls.candidate({callId:this.id,candidate:queued.candidate});
  if(kind==='offer'){await this.callbacks.description('answer',revision,result.sdp);await this.flush();}
 });}
 private async flush(){this.acknowledged=this.revision;for(const item of this.local.splice(0))if(item.revision===this.revision)await this.callbacks.candidate(item.revision,item.candidate);}
 async candidate(revision:number,candidate:RTCIceCandidateInit){if(this.closed||revision<this.revision)return;if(this.queued.length>=256)throw new Error('Candidate backlog exceeded.');if(this.remoteRevision!==revision)this.queued.push({revision,candidate});else await nativeCalls.candidate({callId:this.id,candidate});}
 async configure(config:RTCConfiguration){this.config=config;if(this.ready)await nativeCalls.configure({callId:this.id,iceServers:config.iceServers??[]});}
 recover(){if(this.connected){this.clearTimer();this.recovering=false;this.callbacks.state('connected');return;}this.reconnect(false);}
 private reconnect(notify=true){if(this.closed||this.recovering)return;this.recovering=true;if(notify)this.callbacks.state('reconnecting');this.deadline(this.timeouts.disconnectMs);
  if(this.caller){const attempt=async()=>{if(this.closed||this.connected)return;if(this.retries>=3)return this.fail('Voice could not reconnect.');const before=this.revision;try{await this.offer(true);}catch{/* Retry within the same outage deadline. */}if(this.revision>before)this.retries++;if(!this.closed&&!this.connected)this.retryTimer=setTimeout(()=>void attempt(),Math.min(1000*(this.retries+1),this.timeouts.disconnectMs/3));};void attempt();}
 }
 mute(muted:boolean){this.muted=muted;nativeOperation('mute',nativeCalls.mute({muted:this.muted}));}
 async play(){this.callbacks.playback(false);}
 close(){if(this.closed)return;this.closed=true;this.clearTimer();if(this.retryTimer)clearTimeout(this.retryTimer);this.retryTimer=null;void this.listener?.remove();nativeOperation('cancel-native-start',nativeCalls.end({callId:this.id}));if(this.ready)void this.ready.catch(()=>undefined).then(()=>nativeCalls.end({callId:this.id})).catch(()=>undefined);this.queued=[];this.local=[];}
}
