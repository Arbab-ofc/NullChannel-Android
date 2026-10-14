import { CallDelivery } from '../services/call-delivery.js';
import { pushConfigured, pushDevices, pushRoomEvent, deliverPush } from '../services/push.service.js';
import { supabase } from '../config/supabase.js';
import { socketSessionValid } from './auth.js';
import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { env } from '../config/env.js';
import { getRoomByCode } from '../services/room.service.js';
import { getParticipantsForRoom } from '../services/membership.service.js';
import { callRefSchema, callReceivedSchema, callRejectSchema, callResumeSchema, callInviteSchema, callDescriptionSchema, callIceSchema, type CallAck } from '../schemas/call.schema.js';
import { allowEvent } from './rateLimit.js';
import type { z } from 'zod';

type Participant = { identity: string; socketId: string; name: string; accountId?: string; mobileSessionId?:string; busyKey: string };
export type CallSession = {
  callId: string; roomId: string; roomCode: string; roomName: string;
  caller: Participant; callee: Participant; status: 'ringing' | 'connecting' | 'connected';
  createdAt: number; acceptedAt?: number; recovering: boolean; revision: number; answered: boolean;
  candidates: Map<string, number>; connected: Set<string>; timer: ReturnType<typeof setTimeout>;
  expiryTimer: ReturnType<typeof setTimeout>;roomExpiresAt:string;
  detached?:Set<string>; version: number; ready: Set<string>; deadline: number; delivery: CallDelivery;
};
class CallFailure extends Error { constructor(public code: string, message: string) { super(message); } }
export class CallRegistry {
  readonly calls = new Map<string, CallSession>();
  private readonly busy = new Map<string, string>();
  private pending = 0;
  constructor(private io: Server) {}
  async dispatch(work: () => Promise<CallAck>) {
    if (this.pending >= 64) throw new CallFailure('BUSY','Calling is temporarily busy.');
    this.pending += 1;
    try { return await work(); } finally { this.pending -= 1; }
  }
  private emit(call: CallSession, event: string, extra: object = {}) {
    const payload = { callId: call.callId, roomCode: call.roomCode, ...extra };
    this.io.to(call.caller.socketId).emit(event, payload);
    if(call.callee.accountId)this.io.to(`account:${call.callee.accountId}`).emit(event,payload);else this.io.to(`identity:${call.callee.identity}`).emit(event,payload);
    if (call.callee.socketId) this.io.to(call.callee.socketId).emit(event, payload);
    else for (const socket of this.io.sockets.sockets.values()) {
      if (socket.data.identity === call.callee.identity && socket.rooms.has(call.roomId)) socket.emit(event, payload);
    }
  }
  end(callId: string, reason: string) {
    const call = this.calls.get(callId); if (!call) return;
    clearTimeout(call.timer); clearTimeout(call.expiryTimer);
    this.calls.delete(callId); this.busy.delete(call.caller.busyKey); this.busy.delete(call.callee.busyKey);
    call.candidates.clear(); call.connected.clear(); call.delivery.clear();
    void pushRoomEvent(call.roomId,{eventId:randomUUID(),kind:'call-ended',callId:call.callId,roomCode:call.roomCode,expiresAt:Date.now()+60000}).catch(()=>undefined);
    this.emit(call, reason === 'no-answer' ? 'call:timeout' : ['declined','busy'].includes(reason) ? 'call:rejected' : 'call:ended', { reason });
  }
  endRoom(roomId: string, identity?: string) {
    for (const call of this.calls.values()) if (call.roomId === roomId && (!identity || [call.caller.identity,call.callee.identity].includes(identity))) this.end(call.callId, identity ? 'membership-lost' : 'room-closed');
  }
  extend(roomId: string, expiresAt: string) {
    for (const call of this.calls.values()) if (call.roomId === roomId) {
      call.roomExpiresAt=expiresAt;call.version++;this.emit(call,'call:state',this.snapshot(call));clearTimeout(call.expiryTimer); call.expiryTimer = this.expiry(call.callId, expiresAt);
    }
  }
  private expiry(id: string, expires: string) {
    const timer = setTimeout(() => this.end(id, 'room-expired'), Math.max(0, Date.parse(expires)-Date.now())); timer.unref(); return timer;
  }
  private timeout(call: CallSession, ms: number, reason: string, preserve=false) {
    const now=Date.now();call.deadline=preserve&&call.deadline>0?Math.min(call.deadline,now+ms):now+ms;
    clearTimeout(call.timer); call.timer = setTimeout(() => this.end(call.callId,reason),Math.max(0,call.deadline-now)); call.timer.unref();
  }
  private async eligible(socket: Socket, code: string) {
    const room = await getRoomByCode(code);
    if (!room || Date.parse(room.expires_at) <= Date.now()) throw new CallFailure('ROOM_EXPIRED','This room is unavailable or expired.');
    if (room.room_type !== 'private') throw new CallFailure('PRIVATE_ONLY','Voice calls are available only in private rooms.');
    const members = await getParticipantsForRoom(room.id);
    if (!members.some(member => member.sender_id === socket.data.identity) || !socket.rooms.has(room.id)) throw new CallFailure('JOIN_REQUIRED','Join this room before calling.');
    if (members.length !== 2 || new Set(members.map(member => member.sender_id)).size !== 2) throw new CallFailure('PEER_UNAVAILABLE','A call needs two room members.');
    if (!socket.connected) throw new CallFailure('DISCONNECTED','Reconnect before calling.');
    return { room, members };
  }
  async invite(socket: Socket, code: string): Promise<CallAck> {
    const { room, members } = await this.eligible(socket,code);
    const other = members.find(member => member.sender_id !== socket.data.identity)!;
    let otherAccount: string|undefined;
    if(socket.data.accountId&&socket.data.accountRoom){const result=await supabase.from('nc_room_identities').select('account_id').eq('room_id',room.id).eq('sender_id',other.sender_id).maybeSingle();if(result.error)throw result.error;otherAccount=result.data?.account_id;}
    const callerKey=socket.data.accountId?`account:${socket.data.accountId}`:socket.data.identity;
    const calleeKey=otherAccount?`account:${otherAccount}`:other.sender_id;
    if (this.busy.has(callerKey) || this.busy.has(calleeKey)) throw new CallFailure('BUSY','One participant is already in a call.');
    if (this.calls.size >= env.CALL_MAX_ACTIVE) throw new CallFailure('BUSY','Calling is temporarily at capacity.');
    const online = [...this.io.sockets.sockets.values()].filter(peer => peer.data.identity === other.sender_id && peer.rooms.has(room.id) && peer.connected);
    const peers: Socket[] = [];
    for (const peer of online.slice(0,8)) {
      if (await socketSessionValid(peer) && peer.connected && peer.rooms.has(room.id)) peers.push(peer);
    }
    // No await between these final checks and acquiring both identity locks.
    if (!socket.connected || !socket.rooms.has(room.id) || Date.parse(room.expires_at) <= Date.now()) throw new CallFailure('ROOM_EXPIRED','The room is no longer available.');
    if (this.busy.has(callerKey) || this.busy.has(calleeKey)) throw new CallFailure('BUSY','One participant is already in a call.');
    if (this.calls.size >= env.CALL_MAX_ACTIVE) throw new CallFailure('BUSY','Calling is temporarily at capacity.');
    const globalCandidates=otherAccount?[...this.io.sockets.sockets.values()].filter(peer=>peer.data.accountId===otherAccount&&peer.connected&&peer.handshake.headers.origin===env.MOBILE_APP_ORIGIN):[...this.io.sockets.sockets.values()].filter(peer=>peer.data.globalCalls&&peer.data.identity===other.sender_id&&peer.connected);
    const globalPeers:Socket[]=[];for(const candidate of globalCandidates.slice(0,8))if(await socketSessionValid(candidate)&&candidate.connected)globalPeers.push(candidate);
    const canPush=pushConfigured()&&(await pushDevices.eligible(room.id,other.sender_id)).length>0;
    if (!peers.length && !globalPeers.length && !canPush) throw new CallFailure('PEER_OFFLINE','The other participant is not connected.');
    if(this.busy.has(callerKey)||this.busy.has(calleeKey))throw new CallFailure('BUSY','One participant is already in a call.');
    if(!socket.connected||!socket.rooms.has(room.id)||Date.parse(room.expires_at)<=Date.now())throw new CallFailure('ROOM_EXPIRED','The room is no longer available.');
    const caller = members.find(member => member.sender_id === socket.data.identity)!;
    const id = randomUUID();
    const call: CallSession = { callId: id, roomId: room.id, roomCode: code, roomName: room.room_name,
      caller: { identity: socket.data.identity, socketId: socket.id, name: caller.sender_name,accountId:socket.data.accountId,mobileSessionId:socket.data.mobileSessionId,busyKey:callerKey },
      callee: { identity: other.sender_id, socketId: '', name: other.sender_name,accountId:otherAccount,busyKey:calleeKey }, status: 'ringing', createdAt: Date.now(),
      roomExpiresAt:room.expires_at,version:1,ready:new Set(),deadline:Date.now()+env.CALL_RING_TIMEOUT_MS,delivery:new CallDelivery(),revision: 0, recovering: false, answered: false, candidates: new Map(), connected: new Set(),
      timer: setTimeout(() => this.end(id,'no-answer'),env.CALL_RING_TIMEOUT_MS), expiryTimer: this.expiry(id,room.expires_at) };
    call.timer.unref(); this.calls.set(id,call); this.busy.set(callerKey,id); this.busy.set(calleeKey,id);
    const timeouts = { ringMs: env.CALL_RING_TIMEOUT_MS,connectMs: env.CALL_CONNECT_TIMEOUT_MS,disconnectMs: env.CALL_DISCONNECT_GRACE_MS };
    socket.emit('call:outgoing',{ protocol:2,expiresAt:call.deadline,timeouts,callId: id, roomCode: code, peerName: call.callee.name, roomName: room.room_name });
    for (const peer of peers) peer.emit('call:incoming',{ protocol:2,expiresAt:call.deadline,timeouts,callId: id, roomCode: code, peerName: call.caller.name, roomName: room.room_name });
    for(const peer of globalPeers) if(!peers.includes(peer))peer.emit('call:invitation',{protocol:2,timeouts,callId:id,roomCode:code,peerName:caller.sender_name,roomName:room.room_name,expiresAt:call.deadline});
    void pushRoomEvent(room.id,{eventId:id,kind:'incoming-call',callId:id,roomCode:code,expiresAt:call.deadline},other.sender_id).catch(()=>undefined);
    return { ok: true, callId: id };
  }
  async authorize(socket: Socket, callId: string) {
    const call = this.calls.get(callId);
    if (!call || ![call.caller.identity,call.callee.identity].includes(socket.data.identity)) throw new CallFailure('INVALID_CALL','This call is unavailable.');
    const role: 'caller'|'callee' = call.caller.identity === socket.data.identity ? 'caller' : 'callee';
    if(call[role].socketId&&call[role].socketId!==socket.id){if(!call.detached?.has(call[role].identity))throw new CallFailure('OTHER_TAB','This call belongs to another tab.');if(call[role].mobileSessionId&&call[role].mobileSessionId!==socket.data.mobileSessionId)throw new CallFailure('OTHER_DEVICE','This call belongs to another device.');call[role].socketId=socket.id;call.detached.delete(call[role].identity);}
    try {
      const { members } = await this.eligible(socket,call.roomCode);
      if (!members.some(m => m.sender_id === call.caller.identity) || !members.some(m => m.sender_id === call.callee.identity)) throw new Error('Membership changed');
    } catch (error) { this.end(callId,'room-unavailable'); throw error; }
    const otherId = role === 'caller' ? call.callee.socketId : call.caller.socketId;
    if (otherId) {
      const other = this.io.sockets.sockets.get(otherId);
      if (other&&!await socketSessionValid(other)) { this.end(callId,'session-ended'); throw new CallFailure('SESSION_EXPIRED','The peer session ended.'); }
    }
    if (!this.calls.has(callId)) throw new CallFailure('INVALID_CALL','This call has ended.');
    return { call, role };
  }
  snapshot(call:CallSession){return {callId:call.callId,phase:call.status,stateVersion:call.version,revision:call.revision,ready:{caller:call.ready.has(call.caller.identity),callee:call.ready.has(call.callee.identity)},deadline:call.deadline,roomExpiresAt:call.roomExpiresAt,recovering:call.recovering};}
  invitation(principal:{accountId:string|null;identityId:string|null},id:string){const call=this.calls.get(id);if(!call||call.status!=='ringing'||call.deadline<=Date.now()||!(principal.accountId&&principal.accountId===call.callee.accountId||principal.identityId&&principal.identityId===call.callee.identity))return null;return {callId:id,roomCode:call.roomCode,peerName:call.caller.name,roomName:call.roomName,expiresAt:call.deadline,timeouts:{ringMs:env.CALL_RING_TIMEOUT_MS,connectMs:env.CALL_CONNECT_TIMEOUT_MS,disconnectMs:env.CALL_DISCONNECT_GRACE_MS}};}
  canControl(principal:{accountId:string|null;identityId:string|null},id:string){const call=this.calls.get(id);return !!call&&[call.caller,call.callee].some(peer=>principal.accountId?peer.accountId===principal.accountId:peer.identity===principal.identityId);}
  authorizedSnapshot(principal:{accountId:string|null;identityId:string|null},id:string){const call=this.calls.get(id);if(!call||!this.canControl(principal,id))return null;const role=(principal.accountId?call.caller.accountId===principal.accountId:call.caller.identity===principal.identityId)?'caller':'callee';return {snapshot:this.snapshot(call),role,answered:call.answered,peerName:role==='caller'?call.callee.name:call.caller.name,roomName:call.roomName};}
  ringing(id:string){const call=this.calls.get(id);if(call?.status==='ringing')this.io.to(call.caller.socketId).emit('call:ringing',{callId:id});}
  async action(socket:Socket,event:string,data:{callId:string;messageId?:string;signalId?:string;revision?:number;sdp?:string;candidate?:unknown}):Promise<CallAck>{
    const call=this.calls.get(data.callId);
    if(!call)return event==='call:end'?{ok:true}:Promise.reject(new CallFailure('INVALID_CALL','This call is unavailable.'));
    return call.delivery.run(()=>call.delivery.once(socket.data.identity,data.messageId,event,data,()=>this.processAction(socket,event,data)));
  }
  private async processAction(socket: Socket, event: string, data: { callId: string; messageId?:string; signalId?:string; revision?: number; sdp?: string; candidate?: unknown;takeover?:boolean }): Promise<CallAck> {
    // Repeating termination after cleanup is safe and leaks no call metadata.
    if (event === 'call:end' && !this.calls.has(data.callId)) return { ok: true };
    if(event==='call:resume'&&(data as {takeover?:boolean}).takeover&&socket.data.mobileSessionId){const existing=this.calls.get(data.callId);const owner=existing&&[existing.caller,existing.callee].find(peer=>peer.identity===socket.data.identity);const prior=owner&&this.io.sockets.sockets.get(owner.socketId);if(prior&&prior.id!==socket.id&&prior.data.mobileSessionId===socket.data.mobileSessionId)prior.disconnect(true);}
    const { call, role } = await this.authorize(socket,data.callId);
    if(event==='call:resume'){call.ready.add(socket.data.identity);call.version++;this.emit(call,'call:state',this.snapshot(call));return {ok:true,callId:call.callId,snapshot:this.snapshot(call),replay:call.delivery.replay(role,call.revision)};}
    if(event==='call:received'){call.delivery.acknowledge(role,data.signalId!);return {ok:true};}
    if(event==='call:ringing'){if(role!=='callee')throw new CallFailure('INVALID_STATE','Only the receiver can confirm ringing.');this.ringing(call.callId);return {ok:true};}
    if (event === 'call:end') { this.end(call.callId,'hangup'); return { ok: true }; }
    if (event === 'call:accept' || event === 'call:reject') {
      if (role !== 'callee' || call.status !== 'ringing') throw new CallFailure('INVALID_STATE','This invitation has already been handled.');
      if (event === 'call:reject') { this.end(call.callId,(data as {reason?:string}).reason==='busy'?'busy':'declined'); return { ok: true }; }
      call.ready.add(call.caller.identity);call.ready.add(call.callee.identity);call.version++;call.callee.mobileSessionId=socket.data.mobileSessionId;call.callee.socketId = socket.id; call.status = 'connecting'; call.acceptedAt = Date.now();
      this.timeout(call,env.CALL_CONNECT_TIMEOUT_MS,'connection-timeout');
      for (const tab of this.io.sockets.sockets.values()) if ((tab.data.identity === call.callee.identity || call.callee.accountId&&tab.data.accountId===call.callee.accountId) && tab.id !== socket.id && (!socket.data.mobileSessionId || tab.data.mobileSessionId!==socket.data.mobileSessionId)) tab.emit('call:ended',{ callId: call.callId, roomCode: call.roomCode, reason: 'answered-elsewhere' });
      if(pushConfigured())void pushDevices.eligible(call.roomId,call.callee.identity).then(devices=>deliverPush(devices.filter(device=>device.principal.id!==socket.data.mobileSessionId),{eventId:randomUUID(),kind:'call-ended',callId:call.callId,roomCode:call.roomCode,expiresAt:Date.now()+60000})).catch(()=>undefined);
      this.emit(call,'call:accepted',{snapshot:this.snapshot(call)}); return { ok: true };
    }
    if (call.status === 'ringing') throw new CallFailure('INVALID_STATE','Accept the call before negotiating.');
    const target = role === 'caller' ? call.callee.socketId : call.caller.socketId;
    if ((!this.io.sockets.sockets.get(target)?.connected || !this.io.sockets.sockets.get(target)?.rooms.has(call.roomId))&&!data.messageId&&!['call:connected','call:reconnecting'].includes(event)) { throw new CallFailure('DISCONNECTED','The other participant is reconnecting.'); }
    if (event === 'call:offer') {
      if (role !== 'caller' || data.revision !== call.revision+1 || (call.revision > 0 && !call.answered)) throw new CallFailure('INVALID_STATE','Offer is out of sequence.');
      if(data.messageId&&(!call.ready.has(call.caller.identity)||!call.ready.has(call.callee.identity)))throw new CallFailure('PEERS_NOT_READY','Waiting for both participants to reconnect.');
      call.revision = data.revision; call.answered = false;call.candidates.clear();call.version++;
    } else if (event === 'call:answer') {
      if (role !== 'callee' || call.revision === 0 || data.revision !== call.revision || call.answered) throw new CallFailure('INVALID_STATE','Answer is out of sequence.');
      call.answered = true;
    } else if (event === 'call:ice-candidate') {
      if(data.revision!==undefined&&data.revision<call.revision)throw new CallFailure('STALE_SIGNAL','A newer negotiation revision is active.');
      if (!call.revision || data.revision !== call.revision) throw new CallFailure('INVALID_STATE','ICE candidate is out of sequence.');
      const count = (call.candidates.get(socket.data.identity) ?? 0)+1;
      if (count > env.CALL_MAX_CANDIDATES) throw new CallFailure('CANDIDATE_LIMIT','Too many connection candidates.');
      call.candidates.set(socket.data.identity,count);
    } else if (event === 'call:connected') {
      if (!call.answered) throw new CallFailure('INVALID_STATE','Negotiation is incomplete.');
      call.connected.add(socket.data.identity);
      if (call.connected.size === 2 && !call.detached?.size) { call.status = 'connected'; call.recovering = false; clearTimeout(call.timer);call.deadline=0;call.version++; this.emit(call,'call:connected',this.snapshot(call)); }
      return { ok: true };
    } else if (event === 'call:reconnecting') {
      if (call.recovering) return { ok: true };
      call.status = 'connecting'; call.recovering = true;call.version++; call.connected.clear(); this.timeout(call,env.CALL_DISCONNECT_GRACE_MS,'network-failed');
      this.emit(call,'call:reconnecting'); return { ok: true };
    }
    const outgoing={...data,...(data.messageId?{signalId:data.messageId}:{})};
    if(data.messageId)try{call.delivery.add({signalId:data.messageId,event,data:outgoing,target:role==='caller'?'callee':'caller',revision:data.revision??call.revision});}catch{this.end(call.callId,'signaling-overflow');throw new CallFailure('SIGNAL_BACKLOG','Voice signaling could not recover.');}
    this.io.to(target).emit(event,outgoing); return { ok: true };
  }
  disconnected(socket: Socket) {
    for(const call of this.calls.values()){
      if(call.caller.socketId===socket.id||call.callee.socketId===socket.id){
        if(call.status==='ringing'){this.end(call.callId,'peer-disconnected');continue;}
        call.detached??=new Set();call.detached.add(socket.data.identity);call.ready.delete(socket.data.identity);call.version++;
        this.timeout(call,env.CALL_DISCONNECT_GRACE_MS,'peer-disconnected',true);this.emit(call,'call:state',this.snapshot(call));
      }else if(call.status==='ringing'&&call.callee.identity===socket.data.identity&&![...this.io.sockets.sockets.values()].some(s=>s.id!==socket.id&&s.data.identity===call.callee.identity&&s.rooms.has(call.roomId)))this.end(call.callId,'peer-disconnected');
    }
  }
  dispose() { for (const id of this.calls.keys()) this.end(id,'server-stopped'); }
}
const registries = new WeakMap<Server, CallRegistry>();
export const getCallRegistry = (io: Server) => {
  let registry = registries.get(io); if (!registry) { registry = new CallRegistry(io); registries.set(io,registry); } return registry;
};
export const registerCallSocket = (io: Server, socket: Socket) => {
  const registry = getCallRegistry(io);
  const schemas: Record<string, z.ZodType> = { 'call:invite': callInviteSchema, 'call:accept': callRefSchema, 'call:reject': callRejectSchema,
    'call:received':callReceivedSchema,'call:ringing':callRefSchema,'call:resume':callResumeSchema,'call:end': callRefSchema, 'call:offer': callDescriptionSchema, 'call:answer': callDescriptionSchema,
    'call:ice-candidate': callIceSchema, 'call:connected': callRefSchema, 'call:reconnecting': callRefSchema };
  for (const [event,schema] of Object.entries(schemas)) socket.on(event,(payload: unknown, ack?: (result: CallAck) => void) => {
    const respond = (result: CallAck) => { if (typeof ack === 'function') ack(result); if (!result.ok) socket.emit(result.code === 'BUSY' ? 'call:busy' : 'call:error',result); };
    if (!allowEvent(`${socket.data.identity}:call:${event}`,event === 'call:invite' ? env.CALL_INVITE_LIMIT : env.CALL_SIGNAL_LIMIT)) return respond({ ok: false, code: 'RATE_LIMITED', message: 'Too many call events. Please wait.' });
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return respond({ ok: false, code: 'VALIDATION_ERROR', message: 'Invalid calling payload.' });
    void registry.dispatch(async () => {
      if (event === 'call:invite') return registry.invite(socket,(parsed.data as { roomCode: string }).roomCode);
      return registry.action(socket,event,parsed.data as { callId: string });
    }).then(respond).catch(error => respond({ ok: false, code: error instanceof CallFailure ? error.code : 'CALL_UNAVAILABLE', message: error instanceof CallFailure ? error.message : 'Calling is temporarily unavailable.' }));
  });
  socket.on('disconnect',() => registry.disconnected(socket));
};
