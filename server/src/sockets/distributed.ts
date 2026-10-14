import {clearSocketServer} from './emitter.js';
import type {Server} from 'socket.io';
import {createClient} from 'redis';
import {createAdapter} from '@socket.io/redis-adapter';
import {env} from '../config/env.js';
import {RedisCallStore} from '../services/call-coordination.js';
import {DistributedCallRegistry} from './distributed-calls.js';
import {installCallRegistry} from './call.socket.js';
const health=new WeakMap<Server,()=>Promise<boolean>>();
const readiness=new WeakMap<Server,Promise<void>>();
const shutdowns=new WeakMap<Server,()=>Promise<void>>();
export function configureDistributedCalls(io:Server){
 const ready=(async()=>{if(env.CALL_COORDINATION_MODE!=='redis')return;
  const pub=createClient({url:env.CALL_REDIS_URL,socket:{connectTimeout:4000,reconnectStrategy:false}}),sub=pub.duplicate();pub.on('error',()=>io.local.disconnectSockets(true));sub.on('error',()=>io.local.disconnectSockets(true));const publications=new Set<Promise<number>>();const adapterPub=new Proxy(pub,{get(target,key){if(key==='publish')return (...args:Parameters<typeof pub.publish>)=>{const work=target.publish(...args);publications.add(work);return work.catch(()=>0);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  const store=new RedisCallStore(env.CALL_REDIS_URL!,env.CALL_REDIS_ENCRYPTION_KEY!);
  try{await Promise.all([pub.connect(),sub.connect(),store.connect()]);io.adapter(createAdapter(adapterPub,sub,{requestsTimeout:3000,publishOnSpecificResponseChannel:true}));const registry=new DistributedCallRegistry(io,store,async()=>{const batch=[...publications];const results=await Promise.allSettled(batch);for(const work of batch)publications.delete(work);return results.every(result=>result.status==='fulfilled');});installCallRegistry(io,registry);health.set(io,async()=>pub.isReady&&sub.isReady&&await store.healthy());
   shutdowns.set(io,async()=>{await registry.close();await Promise.all([pub.quit(),sub.quit(),store.close()]);});
  }catch{if(pub.isOpen)pub.destroy();if(sub.isOpen)sub.destroy();await store.close().catch(()=>undefined);throw new Error('Distributed call coordination unavailable.');}
 })();readiness.set(io,ready);return ready;
}
export const socketServerReady=(io:Server)=>readiness.get(io)??Promise.resolve();
export const distributedCallsHealthy=(io:Server)=>health.get(io)?.()??Promise.resolve(true);
export const closeDistributedCalls=async(io:Server)=>{clearSocketServer(io);await shutdowns.get(io)?.();shutdowns.delete(io);health.delete(io);};
