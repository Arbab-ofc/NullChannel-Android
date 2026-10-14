import {createClient,type RedisClientType} from 'redis';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
/** Lease plus compare-and-commit fencing. State is encrypted and ephemeral. */
export class RedisCallStore {
 private client:RedisClientType;
 constructor(url:string,private key:string,private prefix='nc:calls:v1',private ttlSeconds=90){
  this.client=createClient({url,socket:{connectTimeout:4000,reconnectStrategy:false}});this.client.on('error',()=>undefined);
 }
 async healthy(){return this.client.isReady&&await this.client.ping()==="PONG";}
 async connect(){await this.client.connect();}
 private encode(value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(this.key,'hex'),iv);const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);if(data.length>16*1024*1024)throw new Error('CALL_STORE_CAPACITY');return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
 private decode<T>(value:string):T{const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(this.key,'hex'),bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString()) as T;}
 async transaction<T,R>(work:(state:T|null)=>Promise<{state:T;result:R}>):Promise<R>{
  const lock=`${this.prefix}:lease`,token=randomBytes(24).toString('hex');let acquired=false;
  for(let attempt=0;attempt<100;attempt++){if(await this.client.set(lock,token,{NX:true,PX:6000})){acquired=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}
  if(!acquired)throw new Error('CALL_STORE_BUSY');
  let lost=false;const renewal=setInterval(()=>{void this.client.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],6000) else return 0 end",{keys:[lock],arguments:[token]}).then(value=>{if(value!==1)lost=true;}).catch(()=>{lost=true;});},1500);renewal.unref();
  try{const raw=await this.client.get(`${this.prefix}:state`);const {state,result}=await work(raw?this.decode<T>(raw):null);if(lost)throw new Error('CALL_STORE_LEASE_LOST');
   const committed=await this.client.eval("if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]) redis.call('DEL',KEYS[1]) return 1",{keys:[lock,`${this.prefix}:state`],arguments:[token,this.encode(state),String(this.ttlSeconds)]});if(committed!==1)throw new Error('CALL_STORE_FENCED');return result;
  }finally{clearInterval(renewal);await this.client.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",{keys:[lock],arguments:[token]}).catch(()=>undefined);}
 }
 async close(){if(this.client.isOpen)await this.client.quit();}
}
