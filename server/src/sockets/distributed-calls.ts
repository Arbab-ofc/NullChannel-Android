import {randomUUID} from 'node:crypto';
import type {Server,Socket} from 'socket.io';
import {CallRegistry} from './call.socket.js';
import {RedisCallStore} from '../services/call-coordination.js';
import type {CallAck} from '../schemas/call.schema.js';
type Notice={id:string;target:string;event:string;data:unknown;expiresAt:number};
type SharedState={calls:ReturnType<CallRegistry['exportState']>;outbox:Notice[]};
/** All state transitions commit before notification/socket effects leave an instance. */
export class DistributedCallRegistry extends CallRegistry {
 private sweepJob:ReturnType<typeof setInterval>;
 private sweeping=false;
 private closed=false;
 private inFlight=new Set<Promise<unknown>>();
 constructor(private server:Server,private store:RedisCallStore,private flush:()=>Promise<boolean>=async()=>true){super(server);this.sweepJob=setInterval(()=>{if(!this.sweeping){this.sweeping=true;void this.run(async()=>undefined).catch(()=>undefined).finally(()=>{this.sweeping=false;});}},1000);this.sweepJob.unref();}
 private run<T>(work:(registry:CallRegistry,sockets:Map<string,Socket>)=>Promise<T>):Promise<T>{if(this.closed)return Promise.reject(new Error('CALL_REGISTRY_CLOSED'));const pending=this.execute(work);this.inFlight.add(pending);void pending.then(()=>this.inFlight.delete(pending),()=>this.inFlight.delete(pending));return pending;}
 private async execute<T>(work:(registry:CallRegistry,sockets:Map<string,Socket>)=>Promise<T>):Promise<T>{
  const effects:Array<()=>void>=[];const notices:Notice[]=[];
  const emit=(target:string,event:string,data:unknown)=>{if(['call:offer','call:answer','call:ice-candidate'].includes(event))effects.push(()=>this.server.to(target).emit(event,data));else notices.push({id:randomUUID(),target,event,data,expiresAt:Math.min(Date.now()+60000,Number((data as {expiresAt?:number})?.expiresAt)||Infinity)});};
  const outcome=await this.store.transaction<SharedState|ReturnType<CallRegistry['exportState']>,{value?:T;error?:unknown;notices:Notice[]}>(async state=>{
   const previous:SharedState=Array.isArray(state)?{calls:state,outbox:[]}:state??{calls:[],outbox:[]};
   const directory=await this.server.fetchSockets();const sockets=new Map<string,Socket>();let registry:CallRegistry;
   for(const row of directory){const source=row as unknown as Socket;const proxy=new Proxy(source,{get(target,key){if(key==='connected')return true;if(key==='request')return {headers:row.handshake.headers};if(key==='emit')return (event:string,data:unknown)=>emit(row.id,event,data);if(key==='disconnect')return (close:boolean)=>{registry.disconnected(proxy);effects.push(()=>row.disconnect(close));};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});sockets.set(row.id,proxy);}
   const facade={sockets:{sockets},to:(target:string)=>({emit:(event:string,data:unknown)=>emit(target,event,data)})} as unknown as Server;
   registry=new CallRegistry(facade,false,effect=>effects.push(effect));registry.importState(previous.calls);registry.sweep();
   let result:{value?:T;error?:unknown};try{result={value:await work(registry,sockets)};}catch(error){result={error};}
   const next=registry.exportState();registry.releaseTimers();this.calls.clear();for(const call of registry.calls.values())this.calls.set(call.callId,call);
   const outbox=[...previous.outbox.filter(row=>row.expiresAt>Date.now()),...notices];if(outbox.length>2048)throw new Error('CALL_NOTICE_CAPACITY');return {state:{calls:next,outbox},result:{...result,notices:outbox}};
  });
  for(const effect of effects)effect();for(const notice of outcome.notices)this.server.to(notice.target).emit(notice.event,notice.data);
  if(await this.flush()&&outcome.notices.length){const delivered=new Set(outcome.notices.map(row=>row.id));await this.store.transaction<SharedState,void>(async shared=>({state:{calls:shared?.calls??[],outbox:(shared?.outbox??[]).filter(row=>!delivered.has(row.id))},result:undefined}));}
  if(outcome.error)throw outcome.error;return outcome.value as T;
 }
 override invite(socket:Socket,code:string,messageId?:string){return this.run((registry,sockets)=>registry.invite(sockets.get(socket.id)??socket,code,messageId));}
 override action(socket:Socket,event:string,data:{callId:string;messageId?:string;signalId?:string;revision?:number;sdp?:string;candidate?:unknown}):Promise<CallAck>{return this.run((registry,sockets)=>registry.action(sockets.get(socket.id)??socket,event,data));}
 override async invitation(principal:{accountId:string|null;identityId:string|null},id:string){return this.run(registry=>registry.invitation(principal,id));}
 override async canControl(principal:{accountId:string|null;identityId:string|null},id:string){return this.run(registry=>registry.canControl(principal,id));}
 override async authorizedSnapshot(principal:{accountId:string|null;identityId:string|null},id:string){return this.run(registry=>registry.authorizedSnapshot(principal,id));}
 override async end(id:string,reason:string){await this.run(async registry=>{registry.end(id,reason);});}
 override async endRoom(id:string,identity?:string){await this.run(async registry=>{registry.endRoom(id,identity);});}
 override async extend(id:string,expires:string){await this.run(async registry=>{registry.extend(id,expires);});}
 override async ringing(id:string){await this.run(async registry=>{registry.ringing(id);});}
 override disconnected(socket:Socket){void this.run(async registry=>{registry.disconnected(socket);}).catch(()=>undefined);}
 async close(){this.dispose();await Promise.allSettled([...this.inFlight]);}
 override dispose(){this.closed=true;clearInterval(this.sweepJob);this.releaseTimers();/* Shared calls survive an instance shutdown. */}
}
