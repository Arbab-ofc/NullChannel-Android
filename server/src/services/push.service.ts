import {RedisCallStore} from './call-coordination.js';
import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { getParticipantsForRoom, isActiveMember } from './membership.service.js';
import { mobileAccountActive, verifyPushSession, type MobilePrincipal } from './mobile-auth.service.js';

export type PushDevice = { deviceId: string; token: string; secretHash: string; principal: MobilePrincipal; expiresAt: number };
export type PushEvent = { eventId: string; kind: 'message'|'incoming-call'|'call-ended'|'room-expired'; roomCode: string; expiresAt: number; callId?: string };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class PushDevices {
  private sharedStore:Promise<RedisCallStore>|undefined;
  constructor(private isolated=false){}
  private distributed(){return !this.isolated&&env.CALL_COORDINATION_MODE==='redis';}
  private async shared<T>(work:(devices:PushDevices)=>Promise<T>):Promise<T>{
    if(!this.sharedStore)this.sharedStore=(async()=>{const store=new RedisCallStore(env.CALL_REDIS_URL!,env.CALL_REDIS_ENCRYPTION_KEY!,'nc:push:v1',30*86400);await store.connect();return store;})();
    const store=await this.sharedStore;
    return store.transaction<PushDevice[],T>(async rows=>{const local=new PushDevices(true);for(const row of rows??[])if(row.expiresAt>Date.now())local.devices.set(row.deviceId,row);const result=await work(local);return {state:[...local.devices.values()],result};});
  }
  async close(){if(this.sharedStore)await (await this.sharedStore).close();}

  readonly devices = new Map<string, PushDevice>();
  private loaded: Promise<void> | undefined;
  private writes = Promise.resolve();
  private async load() {
    if (!this.loaded) this.loaded = (async () => {
      if (this.isolated || !env.PUSH_DEVICE_STORE_PATH || !env.PUSH_DEVICE_STORE_KEY) return;
      try {
        const data = await readFile(env.PUSH_DEVICE_STORE_PATH); const decipher = createDecipheriv('aes-256-gcm', Buffer.from(env.PUSH_DEVICE_STORE_KEY,'hex'), data.subarray(0,12));
        decipher.setAuthTag(data.subarray(12,28));
        const rows = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString()) as PushDevice[];
        for (const row of rows) if (row.expiresAt > Date.now()) this.devices.set(row.deviceId,row);
      } catch (error) { if ((error as {code?:string}).code !== 'ENOENT') throw new Error('Push device storage unavailable.'); }
    })();
    return this.loaded;
  }
  private persist() {
    if (this.isolated || !env.PUSH_DEVICE_STORE_PATH || !env.PUSH_DEVICE_STORE_KEY) return Promise.resolve();
    const path = env.PUSH_DEVICE_STORE_PATH, key = env.PUSH_DEVICE_STORE_KEY;
    this.writes = this.writes.catch(()=>undefined).then(async () => {
      const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
      const encrypted=Buffer.concat([cipher.update(JSON.stringify([...this.devices.values()])),cipher.final()]);
      await mkdir(dirname(path),{recursive:true,mode:0o700});
      await writeFile(`${path}.tmp`,Buffer.concat([iv,cipher.getAuthTag(),encrypted]),{mode:0o600}); await rename(`${path}.tmp`,path);
    });
    return this.writes;
  }
  async register(deviceId: string, token: string, secret: string, principal: MobilePrincipal):Promise<PushDevice> {
    if(this.distributed())return this.shared(local=>local.register(deviceId,token,secret,principal));
    await this.load(); const old=this.devices.get(deviceId);
    if (old && !timingSafeEqual(Buffer.from(old.secretHash,'hex'),Buffer.from(digest(secret),'hex'))) throw new Error('DEVICE_OWNERSHIP');
    if (!old && this.devices.size>=10000) throw new Error('PUSH_CAPACITY');
    const record={deviceId,token,secretHash:digest(secret),principal,expiresAt:Date.now()+30*86400_000};
    this.devices.set(deviceId,record); await this.persist(); return record;
  }
  async authenticate(deviceId: string, secret: string):Promise<PushDevice|null> {
    if(this.distributed())return this.shared(local=>local.authenticate(deviceId,secret));
    await this.load(); const record=this.devices.get(deviceId);
    if (!record || record.expiresAt<=Date.now() || !/^[a-f0-9]{64}$/.test(secret)) return null;
    if (!timingSafeEqual(Buffer.from(record.secretHash,'hex'),Buffer.from(digest(secret),'hex'))) return null;
    const principal=await verifyPushSession(record.principal.id);
    if (!principal || (principal.accountId && !await mobileAccountActive(principal.accountId))) { await this.remove(deviceId); return null; }
    return record;
  }
  async remove(deviceId: string):Promise<void> {if(this.distributed())return this.shared(local=>local.remove(deviceId)); await this.load(); this.devices.delete(deviceId); await this.persist(); }
  async revokeSession(id: string):Promise<void> {if(this.distributed())return this.shared(local=>local.revokeSession(id)); await this.load(); for(const [key,row] of this.devices) if(row.principal.id===id)this.devices.delete(key); await this.persist(); }
  async identity(record: PushDevice, roomId: string) {
    if (record.principal.identityId) return record.principal.identityId;
    if (!record.principal.accountId) return null;
    const {data,error}=await supabase.from('nc_room_identities').select('sender_id').eq('room_id',roomId).eq('account_id',record.principal.accountId).maybeSingle();
    if(error)throw error; return data?.sender_id ?? null;
  }
  async eligible(roomId: string, targetIdentity?: string):Promise<PushDevice[]> {
    if(this.distributed())return this.shared(local=>local.eligible(roomId,targetIdentity));
    await this.load(); const rows: PushDevice[]=[];
    const members=new Set((await getParticipantsForRoom(roomId)).map(row=>row.sender_id).filter(id=>!targetIdentity||id===targetIdentity));
    if(!members.size)return rows;
    const accounts=new Set<string>();
    if([...this.devices.values()].some(row=>row.principal.accountId)){
      const {data,error}=await supabase.from('nc_room_identities').select('account_id,sender_id').eq('room_id',roomId).in('sender_id',[...members]);
      if(error)throw error;for(const row of data??[])if(row.account_id)accounts.add(row.account_id);
    }
    // Filter before session checks: an unrelated device never causes a database lookup per message.
    const candidates=[...this.devices.values()].filter(row=>row.principal.identityId?members.has(row.principal.identityId):!!row.principal.accountId&&accounts.has(row.principal.accountId));
    for(const record of candidates) {
      if(record.expiresAt<=Date.now()) { await this.remove(record.deviceId); continue; }
      const principal=await verifyPushSession(record.principal.id);
      if(!principal || principal.accountId&&!await mobileAccountActive(principal.accountId)){await this.remove(record.deviceId);continue;}
      const identity=await this.identity(record,roomId);
      if(identity && (!targetIdentity || identity===targetIdentity) && await isActiveMember(roomId,identity))rows.push(record);
    }
    return rows;
  }
}
export const pushDevices = new PushDevices();
export const pushConfigured = () => env.PUSH_ENABLED === 'true';
export async function deliverPush(records: PushDevice[], event: PushEvent) {
  if (!pushConfigured() || event.expiresAt<=Date.now()) return;
  const app=getApps()[0]??initializeApp({credential:applicationDefault(),projectId:env.FIREBASE_PROJECT_ID});
  const sent=new Set<string>();
  for(const record of records) {
    if(sent.has(record.token))continue;sent.add(record.token);
    try {
      await getMessaging(app).send({token:record.token,data:{...event,expiresAt:String(event.expiresAt),deviceId:record.deviceId},android:{priority:['incoming-call','call-ended'].includes(event.kind)?'high':'normal',ttl:Math.min(3600_000,event.expiresAt-Date.now()),collapseKey:event.callId??event.roomCode}});
    } catch(error) {
      const code=(error as {code?:string}).code;
      if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code??''))await pushDevices.remove(record.deviceId);
      // Never print provider errors: they can contain tokens or payload data.
    }
  }
}
export async function pushRoomEvent(roomId: string, event: PushEvent, target?:string, exclude?:string) {
  if(!pushConfigured())return;
  const records=await pushDevices.eligible(roomId,target);
  const allowed=[];
  for(const row of records)if(!exclude || await pushDevices.identity(row,roomId)!==exclude)allowed.push(row);
  await deliverPush(allowed,event);
}
