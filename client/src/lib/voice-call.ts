import type { Socket } from 'socket.io-client';
import { AudioPeer, CALL_DEFAULTS, microphoneError, NETWORK_FAILURE, type CallPeer } from './webrtc';
import { fetchIceLease, type IceLease } from './ice-lease';
import { NativeAudioPeer, nativeAndroid, nativeCalls, nativeOperation } from './native-calls';
import { acquireMicrophone, releaseMicrophone } from './call-ownership';

export type CallPhase = 'idle' | 'outgoing' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'failed' | 'busy';
export type CallView = { visibleRoom?:boolean;phase: CallPhase; callId: string | null; peerName: string; roomName: string; muted: boolean; playbackBlocked: boolean; connectedAt: number | null; message: string; accepting: boolean; audioRoutes?:Array<{id:string;label:string}>; selectedRoute?:string; audioInterrupted?:boolean };
export const callTransitions: Record<CallPhase, readonly CallPhase[]> = {
  idle: ['outgoing','incoming','failed'], outgoing: ['busy','ringing','connecting','ended','failed'], ringing: ['busy','connecting','ended','failed'], incoming: ['busy','connecting','ended','failed'],
  connecting: ['reconnecting','connected','ended','failed'], connected: ['reconnecting','ended','failed'],
  reconnecting: ['reconnecting','connected','ended','failed'], ended: ['idle'], failed: ['idle'], busy:['idle']
};
const empty = (): CallView => ({ phase: 'idle',callId: null,peerName: '',roomName: '',muted: false,playbackBlocked: false,connectedAt: null,message: '',accepting: false });
export const callIsActive = (phase: CallPhase) => !['idle','ended','failed','busy'].includes(phase);
export type Invitation = { protocol?:number; expiresAt?:number; timeouts?: typeof CALL_DEFAULTS; callId: string; roomCode: string; peerName: string; roomName: string };
export type CallSnapshot={callId:string;phase:'ringing'|'connecting'|'connected';stateVersion:number;revision:number;ready:{caller:boolean;callee:boolean};deadline:number;recovering:boolean};
type Signal={event:string;data:{callId:string;revision:number;sdp?:string;candidate?:RTCIceCandidateInit;signalId?:string}};
type Ack = { snapshot?:CallSnapshot;replay?:Signal[]; ok: boolean; code?: string; message?: string; callId?: string };
export class VoiceCall {
  private view = empty();
  private listeners = new Set<() => void>();
  private engine: CallPeer | null = null;
  private caller = false;
  private disposed = false;
  private handlers = new Map<string, (...args: unknown[]) => void>();
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private pendingSignals:Array<{event:string;data:object}>=[];
  private signalingDeadline:ReturnType<typeof setTimeout>|null=null;
  private generation = 0;
  private timeouts = CALL_DEFAULTS;
  private reliable=false;
  private stateVersion=0;
  private networkTimer:ReturnType<typeof setTimeout>|null=null;
  private negotiated=false;
  private received=new Set<string>();
  private receiving=new Map<string,Promise<void>>();
  private requests=new AbortController();
  private iceAbort:AbortController|null=null;
  private iceLease:IceLease|null=null;
  private joinInfo:{senderId:string;senderName:string}|null=null;
  private isReady=true;
  private nativeRestore:{revision:number;connected:boolean}|undefined;
  sessionKind:'guest'|'account'='guest';
  guard=()=>true;
  private invitationHandler:((payload:Invitation)=>void)|null=null;
  constructor(private socket: Socket, readonly roomCode: string,
    private peerFactory?: (caller: boolean, callbacks: ConstructorParameters<typeof AudioPeer>[1], timeouts: typeof CALL_DEFAULTS, config: RTCConfiguration) => CallPeer) {}
  get signalingSocket(){return this.socket;}
  snapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<CallView>) { if (this.disposed) return; const previous=this.view.phase;this.view = { ...this.view,...patch };if(nativeAndroid()&&previous!==this.view.phase)this.nativePhase(previous); for (const listener of this.listeners) listener(); }
  private transition(phase: CallPhase, patch: Partial<CallView> = {}) {
    if (phase === this.view.phase) { this.update(patch); return; }
    if (!callTransitions[this.view.phase].includes(phase)) return;
    this.update({ ...patch,phase });
  }
  private reset() { if (['ended','failed','busy'].includes(this.view.phase)) { this.transition('idle'); this.update({...empty(),visibleRoom:this.view.visibleRoom}); } }
  private signal(event:string,data:object){if(!this.socket.connected&&['connected','reconnecting'].includes(this.view.phase)){if(this.pendingSignals.length>=64)return Promise.reject(new Error('Voice signaling backlog exceeded.'));this.pendingSignals.push({event,data});return Promise.resolve();}return this.request(event,data).then(()=>undefined);}
  private async request(event: string, data: object):Promise<Ack> {
    const generation=this.generation,origin=(data as {callId?:string}).callId;
    const payload=this.reliable&&event!=='call:invite'?{messageId:crypto.randomUUID(),...data}:data;
    const stopping=['call:end','call:reject','call:invite'].includes(event), signal=stopping?undefined:this.requests.signal;
    const limit=this.reliable&&!stopping?3:1;
    for(let attempt=0;attempt<limit;attempt++){
      if(signal?.aborted)throw new Error('Call cancelled.');
      if(!this.socket.connected){if(attempt+1===limit)throw new Error('Voice signaling disconnected.');await new Promise(resolve=>setTimeout(resolve,500));continue;}
      try{
        const result=await new Promise<Ack>((resolve,reject)=>{
          let settled=false;const cancel=()=>{if(settled)return;settled=true;reject(new Error('Call cancelled.'));};
          signal?.addEventListener('abort',cancel,{once:true});
          this.socket.timeout(this.reliable?2500:8000).emit(event,payload,(error:Error|null,result:Ack)=>{
            signal?.removeEventListener('abort',cancel);if(settled)return;settled=true;
            if(error||!result)reject(new Error('Voice signaling timed out.'));else resolve(result);
          });
        });
        if(!result.ok){
          if(result.code==='STALE_SIGNAL'&&event==='call:ice-candidate')return {ok:true};
          if(this.reliable&&['DISCONNECTED','PEERS_NOT_READY'].includes(result.code??'')&&attempt+1<limit){await new Promise(resolve=>setTimeout(resolve,500));continue;}
          if(result.code==='INVALID_CALL'&&origin===this.view.callId&&generation===this.generation)this.finish('ended','Call ended.');
          throw Object.assign(new Error(result.message??'Calling is unavailable.'),{code:result.code});
        }
        return result;
      }catch(error){if(!this.reliable||signal?.aborted||attempt+1===limit)throw error;}
    }
    throw new Error('Voice signaling could not reconnect.');
  }
  attach() {
    if (this.handlers.size) return;
    this.disposed = false;
    const on = <T,>(event: string,handler: (payload: T) => void) => {
      const typed = (...args: unknown[]) => handler(args[0] as T); this.handlers.set(event,typed); this.socket.on(event,typed);
    };
    on<Invitation>('call:outgoing',payload => {
      if(payload.roomCode===this.roomCode)this.reliable=payload.protocol===2;
      if (payload.roomCode === this.roomCode && payload.timeouts) this.timeouts = payload.timeouts;
      if (payload.roomCode === this.roomCode && ['outgoing','ringing'].includes(this.view.phase) && !this.view.callId) this.update({ callId: payload.callId,peerName: payload.peerName,roomName: payload.roomName });
    });
    this.invitationHandler=(payload:Invitation)=>{
      if (payload.roomCode !== this.roomCode || payload.callId===this.view.callId&&callIsActive(this.view.phase)) return;
      this.reliable=payload.protocol===2;
      if (payload.timeouts) this.timeouts = payload.timeouts;
      if (['outgoing','ringing'].includes(this.view.phase) && !this.view.callId) { this.transition('ended'); this.reset(); }
      this.reset();
      if(payload.expiresAt&&payload.expiresAt<=Date.now())return;
      if(!this.guard()){void this.request('call:reject',{callId:payload.callId,...(this.reliable?{reason:'busy'}:{})}).catch(()=>undefined);if(nativeAndroid())nativeOperation('busy-invitation',nativeCalls.tone({tone:'stop',callId:payload.callId,cancelNotification:true}));return;}
      this.requests=new AbortController();
      if (this.view.phase === 'idle') { this.caller = false; this.transition('incoming',{ callId: payload.callId,peerName: payload.peerName,roomName: payload.roomName });
        if(nativeAndroid())nativeOperation('incoming-notification',nativeCalls.show({kind:'incoming-call',eventId:payload.callId,callId:payload.callId,roomCode:this.roomCode,scope:this.sessionKind,peerName:payload.peerName,expiresAt:payload.expiresAt??Date.now()+this.timeouts.ringMs}));
        if(this.reliable)void this.request('call:ringing',{callId:payload.callId}).catch(()=>undefined);
      }
    };
    on<Invitation>('call:incoming',payload=>this.invitationHandler?.(payload));
    on<{ callId: string }>('call:accepted',payload => {
      if (payload.callId !== this.view.callId || !['incoming','outgoing','ringing'].includes(this.view.phase)) return;
      this.transition('connecting',{ accepting: false });
      if (this.caller) {
        const generation = this.generation;
        void this.loadIceConfiguration().then(config => {
          if (this.disposed || this.generation !== generation || this.view.callId !== payload.callId) return;
          this.engine = this.createPeer(config); const engine = this.engine;
          return engine.offer().catch(error => { if (this.engine === engine) this.fail(microphoneError(error)); });
        }).catch(error => { if (this.generation === generation) this.fail(microphoneError(error)); });
      }
    });
    on<Signal['data']>('call:offer',payload => {void this.receiveSignal({event:'call:offer',data:payload});});
    on<Signal['data']>('call:answer',payload => {void this.receiveSignal({event:'call:answer',data:payload});});
    on<Signal['data']>('call:ice-candidate',payload=>{void this.receiveSignal({event:'call:ice-candidate',data:payload});});
    on<{callId:string}>('call:ringing',payload=>{if(payload.callId===this.view.callId&&this.view.phase==='outgoing')this.transition('ringing');});
    on<CallSnapshot>('call:state',snapshot=>this.reconcile(snapshot));
    on<CallSnapshot>('call:connected',snapshot=>{if(snapshot.callId===this.view.callId&&this.engine?.connected)this.transition('connected');});
    on('connect',()=>this.rejoin());
    on<{code:string;expiresAt:string}>('room-extended',payload=>{if(payload.code===this.roomCode)this.setRoom(true,payload.expiresAt);});
    on<{ callId: string }>('call:reconnecting',payload => { if (payload.callId === this.view.callId) { this.transition('reconnecting'); this.engine?.recover(); } });
    for (const event of ['call:ended','call:rejected','call:timeout']) on<{ callId: string; reason: string }>(event,payload => {
      if (payload.callId !== this.view.callId) return;
      const messages: Record<string,string> = { 'no-answer': this.caller ? 'No Answer' : 'Missed Call', busy:'The other participant is busy.',declined: 'Call declined', 'connection-timeout': NETWORK_FAILURE, 'network-failed': NETWORK_FAILURE, 'peer-disconnected': 'The other participant disconnected.', 'answered-elsewhere': 'Call answered in another tab.', 'room-expired': 'The room expired.', 'membership-lost': 'Room membership ended.' };
      this.finish(payload.reason==='busy'?'busy':payload.reason.includes('timeout') || payload.reason === 'network-failed' ? 'failed' : 'ended',messages[payload.reason] ?? 'Call ended.');
    });
    on<string>('disconnect',reason=>{
      if((['connected','reconnecting'].includes(this.view.phase)||this.reliable&&this.view.phase==='connecting')&&reason!=='io client disconnect'){
        this.transition('reconnecting',{message:'Reconnecting call...'});
        if(this.signalingDeadline)clearTimeout(this.signalingDeadline);
        this.signalingDeadline=setTimeout(()=>this.fail('Voice signaling could not reconnect.'),this.timeouts.disconnectMs);
      }else this.finish('ended','Connection lost. Reconnect and start a new call.');
    });
    on<{code:string}>('room-joined',room=>{
      if(room.code!==this.roomCode||this.view.phase!=='reconnecting'||!this.view.callId)return;
      const id=this.view.callId,generation=this.generation;const current=()=>this.view.callId===id&&this.generation===generation&&!this.disposed;
      void this.request('call:resume',{callId:id}).then(async(result)=>{
        if(!current())return;if(this.reliable&&result.snapshot)this.reconcile(result.snapshot);for(const signal of result.replay??[])await this.receiveSignal(signal);for(const item of this.pendingSignals.splice(0)){if(!current())return;await this.request(item.event,item.data);}
        if(!current())return;if(this.signalingDeadline)clearTimeout(this.signalingDeadline);this.signalingDeadline=null;
        if(this.engine?.connected){await this.request('call:connected',{callId:id});if(current())this.transition('connected');}else this.engine?.recover();
      }).catch(()=>{if(current())this.fail('Voice signaling could not reconnect.');});
    });
    on('room-expired',() => this.finish('ended','The room closed.'));
    on<{ code: string }>('membership-revoked',payload => { if (payload.code === this.roomCode) this.finish('ended','Room membership ended.'); });
  }
  receiveInvitation(payload:Invitation){this.invitationHandler?.(payload);}
  setAudioRoutes(audioRoutes:Array<{id:string;label:string}>,selectedRoute:string){this.update({audioRoutes,selectedRoute});}
  setVisible(visibleRoom:boolean){if(this.view.visibleRoom!==visibleRoom)this.update({visibleRoom});}
  setRoom(eligible: boolean, expiresAt?: string) {
    if (this.expiry) clearTimeout(this.expiry); this.expiry = null;
    if (!eligible) { this.end(); return; }
    if (expiresAt) this.expiry = setTimeout(() => this.end(), Math.max(0,Date.parse(expiresAt)-Date.now()));
  }
  async invite() {
    this.reset(); if (this.view.phase !== 'idle' || this.disposed) return;
    if(!this.guard()){this.transition('failed',{message:'Another call or recording is using the microphone.'});return;}
    this.requests=new AbortController();this.received.clear();this.stateVersion=0;
    this.caller = true; this.transition('outgoing');
    const generation = this.generation;
    try {
      const result = await this.request('call:invite',{ roomCode: this.roomCode });
      if (result.callId && (this.disposed || this.generation !== generation)) {
        // Cancellation can precede both the outgoing event and its acknowledgment.
        void this.request('call:end',{ callId: result.callId }).catch(() => undefined);
      }
    } catch (error) { if (this.generation === generation && this.snapshot().phase === 'outgoing') {if((error as {code?:string}).code==='BUSY')this.finish('busy',microphoneError(error));else this.fail(microphoneError(error));} }
  }
  async accept() {
    if (this.view.phase !== 'incoming' || this.view.accepting) return;
    const id = this.view.callId; const generation = this.generation;
    this.update({ accepting: true });
    try {
      const config = await this.loadIceConfiguration();
      if (this.disposed || this.generation !== generation || this.view.callId !== id) return;
      this.engine = this.createPeer(config); const peer = this.engine;
      await peer.start();
      if (this.disposed || this.generation !== generation || this.view.callId !== id) { peer.close(); return; }
      await this.request('call:accept',{ callId: id });
    } catch (error) { if (this.generation === generation) this.fail(microphoneError(error)); }
  }
  async reject() {
    if (this.view.phase !== 'incoming' || this.view.accepting) return;
    const id = this.view.callId;
    this.finish('ended','Call declined.');
    try { await this.request('call:reject',{ callId: id }); } catch { /* The server also expires the invitation. */ }
  }
  private async loadIceConfiguration(force=false):Promise<RTCConfiguration>{
    if(!force&&this.iceLease&&this.iceLease.expiresAt>Date.now()+60000)return this.iceLease.config;
    this.iceAbort?.abort();const abort=new AbortController();this.iceAbort=abort;
    this.iceLease=await fetchIceLease(this.roomCode,abort.signal);return this.iceLease.config;
  }
  private async restartConfiguration():Promise<RTCConfiguration|false>{
    if(!this.socket.connected)return false;
    if(this.reliable){const result=await this.request('call:resume',{callId:this.view.callId});if(result.snapshot)this.reconcile(result.snapshot);if(result.replay?.length){for(const signal of result.replay)void this.receiveSignal(signal);return false;}if(!this.isReady)return false;}
    return this.loadIceConfiguration(true);
  }
  async restoreNative(callId:string,caller:boolean,snapshot:CallSnapshot,peerName:string,roomName:string,connected:boolean){
    if(callIsActive(this.view.phase))return;
    this.caller=caller;this.reliable=true;this.negotiated=true;this.requests=new AbortController();this.nativeRestore={revision:snapshot.revision,connected};
    this.update({phase:'reconnecting',callId,peerName,roomName,connectedAt:connected?Date.now():null});
    try{const result=await this.request('call:resume',{callId,takeover:true});if(result.snapshot)this.reconcile(result.snapshot);this.engine=this.createPeer(await this.loadIceConfiguration());await this.engine.start();for(const signal of result.replay??[])await this.receiveSignal(signal);}catch{this.fail('The native call could not be restored.');}
  }
  async enableBluetooth(){if(!nativeAndroid())return;const permission=await nativeCalls.bluetoothPermission();if(!permission.granted){this.update({message:'Bluetooth permission denied.'});return;}const routes=await nativeCalls.routes({});this.setAudioRoutes(routes.routes,routes.selected);}
  setJoinInfo(senderId:string,senderName:string,kind:'guest'|'account'='guest'){this.sessionKind=kind;this.joinInfo={senderId,senderName};}
  rejoin(){if(this.joinInfo&&callIsActive(this.view.phase)&&this.socket.connected)this.socket.emit('join-room',{roomCode:this.roomCode,...this.joinInfo});}
  private reconcile(snapshot:CallSnapshot){if(snapshot.callId!==this.view.callId||snapshot.stateVersion<=this.stateVersion)return;this.stateVersion=snapshot.stateVersion;this.isReady=snapshot.ready.caller&&snapshot.ready.callee;if(snapshot.recovering)this.transition('reconnecting');if(this.isReady&&this.view.phase==='reconnecting')this.engine?.recover();}
  private reportConnected(){if(this.negotiated&&this.engine?.connected&&this.socket.connected)void this.request('call:connected',{callId:this.view.callId}).catch(()=>undefined);}
  networkChanged(online:boolean){
    if(this.networkTimer)clearTimeout(this.networkTimer);this.networkTimer=null;
    if(!['connected','reconnecting','connecting'].includes(this.view.phase))return;
    if(!online){this.transition('reconnecting');return;}
    this.networkTimer=setTimeout(()=>{this.networkTimer=null;if(!callIsActive(this.view.phase)||!this.socket.connected)return;if(this.engine?.connected){this.transition('connected');this.reportConnected();return;}void this.request('call:reconnecting',{callId:this.view.callId}).then(()=>this.engine?.recover()).catch(()=>undefined);},2000);
  }
  async receiveSignal(signal:Signal){
    const id=signal.data.signalId;
    if(id&&this.receiving.has(id))return this.receiving.get(id)!;
    const work=this.applySignal(signal);if(id)this.receiving.set(id,work);
    try{await work;}finally{if(id)this.receiving.delete(id);}
  }
  private async applySignal(signal:Signal){
    const payload=signal.data;if(payload.callId!==this.view.callId||!this.engine)return;
    if(payload.signalId&&this.received.has(payload.signalId)){void this.request('call:received',{callId:payload.callId,signalId:payload.signalId}).catch(()=>undefined);return;}
    try{
      const engine=this.engine;
      if(signal.event==='call:ice-candidate'&&payload.candidate)await engine.candidate(payload.revision,payload.candidate);
      else if(payload.sdp)await engine.description(signal.event==='call:offer'?'offer':'answer',payload.revision,payload.sdp);
      if(this.engine!==engine)return;
      if(signal.event==='call:answer'){this.negotiated=true;this.reportConnected();}
      if(payload.signalId){if(this.received.size>=1024)this.received.delete(this.received.values().next().value!);this.received.add(payload.signalId);await this.request('call:received',{callId:payload.callId,signalId:payload.signalId});}
    }catch{if(payload.callId===this.view.callId)this.fail('Voice negotiation could not recover.');}
  }
  private nativePhase(previous:CallPhase){
    const id=this.view.callId;if(!id)return;
    const phase=this.view.phase;
    if(phase==='ringing')nativeOperation('ringback',nativeCalls.tone({tone:'ringback',callId:id,durationMs:this.timeouts.ringMs}));
    else if(phase==='connecting')nativeOperation('stop-ring',nativeCalls.tone({tone:'stop',callId:id,cancelNotification:true}));
    else if(phase==='connected'){if(previous==='connecting')nativeOperation('connected-tone',nativeCalls.tone({tone:'connected',callId:id,durationMs:500}));void nativeCalls.routes({}).then(routes=>this.update({audioRoutes:routes.routes,selectedRoute:routes.selected})).catch(()=>undefined);}
    else if(['ended','failed','busy'].includes(phase))nativeOperation('end-tone',nativeCalls.tone({tone:['connected','reconnecting'].includes(previous)?'stop':'ended',callId:id,durationMs:500,cancelNotification:true}));
  }
  async route(route:string){if(!nativeAndroid())return;try{const routes=await nativeCalls.routes({route});this.update({audioRoutes:routes.routes,selectedRoute:routes.selected});}catch{this.update({message:'Audio output is unavailable.'});}}
  audioInterrupted(available:boolean){this.update({audioInterrupted:!available});}
  private createPeer(config: RTCConfiguration) {
    const id = this.view.callId; const generation = this.generation;
    const current = () => !this.disposed && this.view.callId === id && this.generation === generation;
    const owner=`call:${id}`;if(!acquireMicrophone(owner))throw new Error('Another recording owns the microphone.');
    const factory=this.peerFactory??((caller,callbacks,timeouts,configuration)=>nativeAndroid()?new NativeAudioPeer(id!,this.roomCode,caller,callbacks,configuration,timeouts,this.nativeRestore):new AudioPeer(caller,callbacks,configuration,timeouts));
    const peer=factory(this.caller,{restart:()=>this.restartConfiguration(),
      description: async (kind,revision,sdp) => { if (current()){if(kind==='offer')this.negotiated=false;await this.signal(`call:${kind}`,{ callId: id,revision,sdp });if(kind==='answer'){this.negotiated=true;this.reportConnected();}} },
      candidate: async (revision,candidate) => { if (current()) await this.signal('call:ice-candidate',{ callId: id,revision,candidate }); },
      state: phase => {
        if (!current()) return;
        this.transition(phase,{ connectedAt: phase === 'connected' ? this.view.connectedAt ?? Date.now() : this.view.connectedAt });
        if(this.socket.connected&&(phase!=='connected'||this.negotiated||!this.reliable))void this.request(`call:${phase}`,{ callId: id }).catch(() => { if (current()&&this.socket.connected) this.fail('Voice signaling was interrupted. Please call again.'); });
      }, error: message => { if (current()) this.fail(message); }, playback: blocked => { if (current()) this.update({ playbackBlocked: blocked }); }
    },this.timeouts,config);
    return peer;
  }
  mute() { if (!['connected','reconnecting','connecting'].includes(this.view.phase)) return; const muted = !this.view.muted; this.engine?.mute(muted); this.update({ muted }); }
  play() { void this.engine?.play(); }
  private finish(phase: 'ended' | 'failed' | 'busy',message: string) {
    if(this.signalingDeadline)clearTimeout(this.signalingDeadline);this.signalingDeadline=null;this.pendingSignals=[];
    if(this.networkTimer)clearTimeout(this.networkTimer);this.networkTimer=null;this.negotiated=false;
    this.requests.abort();this.iceAbort?.abort();this.iceAbort=null;this.iceLease=null;this.received.clear();this.receiving.clear();
    releaseMicrophone(`call:${this.view.callId}`);this.generation += 1; this.engine?.close(); this.engine = null;
    if (callIsActive(this.view.phase)) this.transition(phase,{ message,accepting: false,muted: false,playbackBlocked: false });
  }
  private fail(message: string) { const id = this.view.callId; this.finish('failed',message); if (id && this.socket.connected) void this.request('call:end',{ callId: id }).catch(() => undefined); }
  end() { const id = this.view.callId; this.finish('ended','Call ended.'); if (id && this.socket.connected) void this.request('call:end',{ callId: id }).catch(() => undefined); }
  dismiss() { this.reset(); }
  dispose() {
    this.end(); this.disposed = true;
    for (const [event,handler] of this.handlers) this.socket.off(event,handler); this.handlers.clear();
    if (this.expiry) clearTimeout(this.expiry); this.expiry = null;
  }
}
