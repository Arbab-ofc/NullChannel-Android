export const CALL_DEFAULTS = { ringMs: 30000, connectMs: 20000, disconnectMs: 10000 };
export const NETWORK_FAILURE = 'Voice could not connect. This network may require a TURN relay; try another network.';
export const iceConfiguration = (value = import.meta.env.VITE_WEBRTC_STUN_URLS ?? 'stun:stun.l.google.com:19302', relay: RTCIceServer[] = []): RTCConfiguration => {
  const urls = value.split(',').map((url: string) => url.trim()).filter(Boolean);
  if (urls.length > 8 || urls.some((url: string) => !/^stuns?:[a-z0-9.-]+(?::\d{1,5})?$/i.test(url))) throw new Error('Invalid STUN configuration.');
  if (relay.length > 4 || relay.some(server => !server.urls || !server.username || !server.credential)) throw new Error('Invalid authenticated TURN configuration.');
  return { iceServers: [...(urls.length ? [{ urls }] : []), ...relay], bundlePolicy: 'max-bundle', iceCandidatePoolSize: 4 };
};
export const microphoneError = (error: unknown) => {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  const errors: Record<string,string> = {
    NotAllowedError: 'Microphone permission denied. Allow microphone access and try again.',
    NotFoundError: 'No microphone was found.', NotReadableError: 'The microphone is busy or unavailable.',
    OverconstrainedError: 'This microphone does not support the requested audio settings.',
    SecurityError: 'Microphone access is blocked. Use HTTPS and check browser permissions.'
  };
  return errors[name] ?? (error instanceof Error ? error.message : 'Unable to start microphone audio.');
};
export interface CallPeer {
 readonly connected:boolean;start():Promise<void>;offer(restart?:boolean):Promise<void>;
 description(kind:'offer'|'answer',revision:number,sdp:string):Promise<void>;
 candidate(revision:number,candidate:RTCIceCandidateInit):Promise<void>;
 recover():void;mute(muted:boolean):void;play():Promise<void>;close():void;configure?(config:RTCConfiguration):Promise<void>;
}
export type AudioCallbacks = {
  restart?: () => Promise<RTCConfiguration | false>;
  description: (kind: 'offer' | 'answer', revision: number, sdp: string) => Promise<void>;
  candidate: (revision: number, candidate: RTCIceCandidateInit) => Promise<void>;
  state: (state: 'connected' | 'reconnecting') => void;
  error: (message: string) => void;
  playback: (blocked: boolean) => void;
};
export class AudioPeer {
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private ready: Promise<void> | null = null;
  private closed = false;
  private revision = 0;
  private remoteRevision = 0;
  private signaledRevision = 0;
  private ufragRevisions=new Map<string,number>();
  private candidates: Array<{ revision: number; candidate: RTCIceCandidateInit }> = [];
  private localCandidates: Array<{ revision: number; candidate: RTCIceCandidateInit }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private negotiating = false;
  private descriptions=Promise.resolve();
  private pendingRestart=false;
  private retryTimer:ReturnType<typeof setTimeout>|null=null;
  private attempts=0;
  private diagnosticsTimer:ReturnType<typeof setInterval>|null=null;
  private muted = false;
  private deviceListener = () => { if (this.audio?.srcObject) void this.play(); };
  constructor(private caller: boolean, private callbacks: AudioCallbacks,
    private config: RTCConfiguration = iceConfiguration(), private timeouts = CALL_DEFAULTS) {}
  get connected(){return this.pc?.connectionState==='connected'&&!['failed','disconnected'].includes(this.pc.iceConnectionState);}
  start() {
    if (this.ready) return this.ready;
    this.ready = this.initialize(); return this.ready;
  }
  private async initialize() {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined' || !window.isSecureContext) throw new Error('Voice calling requires HTTPS and a browser with WebRTC microphone support.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    if (this.closed) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream;
    try {
      const pc = new RTCPeerConnection(this.config); this.pc = pc;
      const audio = document.createElement('audio'); this.audio = audio; audio.autoplay = true; audio.setAttribute('playsinline','');
      navigator.mediaDevices.addEventListener?.('devicechange',this.deviceListener);
      stream.getAudioTracks().forEach(track => { track.enabled = !this.muted; pc.addTrack(track,stream); track.onended = () => this.fail('The microphone was disconnected.'); });
      pc.ontrack = event => {
        if (this.closed || event.track.kind !== 'audio') return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]); void this.play();
      };
      pc.onicecandidate = event => {
        if (this.closed || !event.candidate || !this.revision) return;
        const candidate = event.candidate.toJSON();
        const ufrag = candidate.usernameFragment;
        if(ufrag&&this.ufragRevisions.has(ufrag)&&this.ufragRevisions.get(ufrag)!==this.revision)return;
        if (ufrag && !pc.localDescription?.sdp.includes(`a=ice-ufrag:${ufrag}`)) return;
        if (this.localCandidates.length >= 256) return this.fail('Too many connection candidates.');
        if (this.signaledRevision === this.revision) void this.sendCandidate(this.revision,candidate);
        else this.localCandidates.push({ revision: this.revision,candidate });
      };
      pc.onconnectionstatechange = () => this.connectionChanged();
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') this.reconnecting();
        else if (pc.iceConnectionState === 'disconnected') this.reconnecting();
      };
      pc.onicecandidateerror=event=>{console.info('voice_diagnostic',{kind:'ice-server',code:event.errorCode});};
      this.diagnosticsTimer=setInterval(()=>{void this.diagnostics();},15000);
      this.deadline(this.timeouts.connectMs);
    } catch (error) { this.close(); throw error; }
  }
  private deadline(ms: number) { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => this.fail(NETWORK_FAILURE),ms); }
  private fail(message: string) { if (this.closed) return; this.close(); this.callbacks.error(message); }
  private async sendCandidate(revision: number, candidate: RTCIceCandidateInit) {
    try { if (!this.closed) await this.callbacks.candidate(revision,candidate); }
    catch { if (!this.closed) this.fail('Voice signaling was interrupted. Please call again.'); }
  }
  private connectionChanged() {
    if (this.closed || !this.pc) return;
    const state = this.pc.connectionState;
    if (state === 'connected') {
      this.recovering = false;this.attempts=0;if(this.retryTimer)clearTimeout(this.retryTimer);this.retryTimer=null;
      if (this.timer) clearTimeout(this.timer); this.timer = null;
      this.callbacks.state('connected');
    } else if (state === 'disconnected') this.reconnecting();
    else if (state === 'failed') this.reconnecting();
  }
  private recovering = false;
  recover() { if(this.connected){this.connectionChanged();return;}this.reconnecting(false); }
  private reconnecting(notify = true) {
    if (this.closed || this.recovering) return;
    this.recovering = true; if (notify) this.callbacks.state('reconnecting'); this.deadline(this.timeouts.disconnectMs);
    // A deterministic caller is the only offerer, including ICE restarts.
    if (this.caller) this.retryRestart();
  }
  private retryRestart(){
    if(this.closed||this.connected)return;
    if(this.attempts>=3)return this.fail(NETWORK_FAILURE);
    const before=this.revision;
    void this.offer(true).catch(()=>undefined).finally(()=>{
      if(this.revision>before)this.attempts++;
      if(!this.closed&&!this.connected)this.retryTimer=setTimeout(()=>this.retryRestart(),Math.min(1000*(this.attempts+1),this.timeouts.disconnectMs/3));
    });
  }
  async configure(config:RTCConfiguration){this.config=config;this.pc?.setConfiguration(config);}
  async offer(restart = false) {
    await this.start(); if (this.closed || !this.pc) return;
    if(this.negotiating){this.pendingRestart ||= restart;return;}
    if (this.revision >= 10000) return this.fail(NETWORK_FAILURE);
    this.negotiating = true;
    try {
      if(restart){const config=await this.callbacks.restart?.();if(config===false)return;if(config)await this.configure(config);}
      if(this.closed)return;
      if(restart&&this.pc.signalingState&&this.pc.signalingState!=='stable'){return;}
      this.revision += 1; this.signaledRevision = 0;
      const offer = await this.pc.createOffer({ iceRestart: restart }); if (this.closed) return;
      for(const match of offer.sdp?.matchAll(/a=ice-ufrag:([^\r\n]+)/g)??[])this.ufragRevisions.set(match[1],this.revision);
      if(this.ufragRevisions.size>16)this.ufragRevisions.delete(this.ufragRevisions.keys().next().value!);
      await this.pc.setLocalDescription(offer); if (this.closed) return;
      await this.callbacks.description('offer',this.revision,this.pc.localDescription!.sdp);
      if (!this.closed) await this.flushLocal();
    } finally { this.negotiating = false;if(this.pendingRestart){this.pendingRestart=false;queueMicrotask(()=>{if(!this.closed)void this.offer(true).catch(()=>undefined);});} }
  }
  async description(kind:'offer'|'answer',revision:number,sdp:string){const next=this.descriptions.catch(()=>undefined).then(()=>this.applyDescription(kind,revision,sdp));this.descriptions=next;return next;}
  private async applyDescription(kind: 'offer' | 'answer', revision: number, sdp: string) {
    if (this.closed || revision<=this.remoteRevision) return;
    if ((kind === 'offer' && this.caller) || (kind === 'answer' && !this.caller)) throw new Error('Invalid negotiation role.');
    if (kind === 'offer') {
      if (revision !== this.revision+1) throw new Error('Invalid offer sequence.'); this.revision = revision;
    } else if (revision !== this.revision) throw new Error('Invalid answer sequence.');
    await this.start(); if (this.closed || !this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: kind,sdp })); if (this.closed) return;
    this.remoteRevision = revision;
    const queued = this.candidates.filter(item=>item.revision<=revision);this.candidates=this.candidates.filter(item=>item.revision>revision);
    for (const item of queued) if (item.revision === revision) await this.pc.addIceCandidate(new RTCIceCandidate(item.candidate));
    if (kind === 'offer') {
      const answer = await this.pc.createAnswer(); if (this.closed) return;
      for(const match of answer.sdp?.matchAll(/a=ice-ufrag:([^\r\n]+)/g)??[])this.ufragRevisions.set(match[1],this.revision);
      if(this.ufragRevisions.size>16)this.ufragRevisions.delete(this.ufragRevisions.keys().next().value!);
      await this.pc.setLocalDescription(answer); if (this.closed) return;
      await this.callbacks.description('answer',revision,this.pc.localDescription!.sdp);
      if (!this.closed) await this.flushLocal();
    }
    if(this.pendingRestart){this.pendingRestart=false;queueMicrotask(()=>void this.offer(true).catch(()=>undefined));}
    if (!this.closed && this.pc?.connectionState === 'connected') this.connectionChanged();
  }
  private async flushLocal() {
    this.signaledRevision = this.revision;
    for (const item of this.localCandidates.splice(0)) if (item.revision === this.revision) await this.sendCandidate(item.revision,item.candidate);
  }
  async candidate(revision: number, candidate: RTCIceCandidateInit) {
    if (this.closed || revision < this.revision) return;
    if (revision > this.revision+1 || this.candidates.length >= 256) throw new Error('Invalid candidate sequence.');
    if (!this.pc?.remoteDescription || this.remoteRevision !== revision) this.candidates.push({ revision,candidate });
    else await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
  mute(muted: boolean) { this.muted = muted; this.stream?.getAudioTracks().forEach(track => { track.enabled = !muted; }); }
  async play() {
    if (!this.audio || this.closed) return;
    try { await this.audio.play(); if (!this.closed) this.callbacks.playback(false); }
    catch { if (!this.closed) this.callbacks.playback(true); }
  }
  private async diagnostics(){
    if(this.closed||!this.pc?.getStats)return;
    try{const stats=await this.pc.getStats();stats.forEach(report=>{
      if(report.type==='candidate-pair'&&report.state==='succeeded'&&report.nominated){const local=stats.get(report.localCandidateId);console.info('voice_diagnostic',{kind:'transport',protocol:local?.protocol,relay:local?.candidateType==='relay'});}
      if(report.type==='inbound-rtp'&&report.kind==='audio')console.info('voice_diagnostic',{kind:'audio',packetsLost:report.packetsLost,packetsReceived:report.packetsReceived,recoveryAttempts:this.attempts});
    });}catch{/* Diagnostics cannot terminate audio. */}
  }
  close() {
    if (this.closed) return; this.closed = true;
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    if(this.retryTimer)clearTimeout(this.retryTimer);this.retryTimer=null;
    if(this.diagnosticsTimer)clearInterval(this.diagnosticsTimer);this.diagnosticsTimer=null;
    navigator.mediaDevices?.removeEventListener?.('devicechange',this.deviceListener);
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); this.stream = null;
    if (this.pc) { this.pc.onicecandidateerror=null;this.pc.ontrack = null; this.pc.onicecandidate = null; this.pc.onconnectionstatechange = null; this.pc.oniceconnectionstatechange = null; this.pc.close(); this.pc = null; }
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; this.audio.remove(); this.audio = null; }
    this.candidates = []; this.localCandidates = [];this.ufragRevisions.clear();
  }
}
