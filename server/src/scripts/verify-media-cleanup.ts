/** Real Supabase/ImageKit cleanup retry test. Operates on one uploaded fixture only. */
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { imagekit } from '../config/imagekit.js';
import { supabase } from '../config/supabase.js';
import { processMediaCleanup } from '../services/cleanup.service.js';

const mode=process.argv[2];
const fileId=process.argv[3];
const statusError=(error:unknown)=>{const v=error as {statusCode?:number;$ResponseMetadata?:{statusCode?:number}};return v.statusCode??v.$ResponseMetadata?.statusCode;};
if(mode==='worker-fail'||mode==='worker-recover'){
 if(!fileId)throw new Error('fixture identifier required');
 else {const due=await supabase.from('media_cleanup').update({next_attempt_at:new Date(Date.now()-1000).toISOString(),lease_until:null}).eq('file_id',fileId);if(due.error)throw new Error('retry scheduling failed');}
 await processMediaCleanup();
 const row=await supabase.from('media_cleanup').select('attempts,lease_until,next_attempt_at').eq('file_id',fileId).maybeSingle();
 if(row.error)throw new Error('queue verification failed');
 if(mode==='worker-fail'){
  const passed=Boolean(row.data&&row.data.attempts>=1&&!row.data.lease_until&&Date.parse(row.data.next_attempt_at)>Date.now());
  console.log(JSON.stringify({stage:'worker-failure',retryPersisted:passed}));if(!passed)process.exitCode=1;
 }else{
  let absent=false;try{await imagekit.getFileDetails(fileId);}catch(error){absent=statusError(error)===404;}
  const passed=!row.data&&absent;console.log(JSON.stringify({stage:'worker-recovery',queueRecordRemoved:!row.data,providerAbsenceConfirmed:absent,recovered:passed}));if(!passed)process.exitCode=1;
 }
}else{
 const queue=await supabase.from('media_cleanup').select('file_id',{count:'exact',head:true});
 if(queue.error||queue.count!==0)throw new Error('shared cleanup queue is not empty; refusing global worker claim');
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=','base64');
 const uploaded=await imagekit.upload({file:image,fileName:`cleanup-audit-${randomUUID()}.png`,folder:'/nullchannel/development-verification',isPrivateFile:true,useUniqueFileName:false});
 try{
  const queued=await supabase.from('media_cleanup').insert({file_id:uploaded.fileId,next_attempt_at:new Date(Date.now()-1000).toISOString()});if(queued.error)throw new Error('test cleanup fixture could not be queued');
  const worker=(stage:string)=>{const childEnv={...process.env,...(stage==='worker-fail'?{IMAGEKIT_PRIVATE_KEY:'invalid-cleanup-audit-key'}:{})};const result=spawnSync(process.execPath,['--import','tsx',new URL(import.meta.url).pathname,stage,uploaded.fileId],{encoding:'utf8',timeout:30000,env:childEnv});if(result.status!==0){const detail=JSON.stringify({status:result.status,signal:result.signal,error:result.error?.name,stdout:(result.stdout||'').replace(/https?:\/\/\S+/g,'[URL]').replace(/[A-Za-z0-9_-]{32,}/g,'[REDACTED]').slice(-250),stderr:(result.stderr||'').replace(/https?:\/\/\S+/g,'[URL]').replace(/[A-Za-z0-9_-]{32,}/g,'[REDACTED]').slice(-250)});throw new Error(`${stage} failed: ${detail}`);}return JSON.parse(result.stdout.trim().split('\n').at(-1)??'{}') as Record<string,unknown>;};
  const failed=worker('worker-fail');
  const recovered=worker('worker-recover');
  const absentRetry=await supabase.from('media_cleanup').insert({file_id:uploaded.fileId,next_attempt_at:new Date(Date.now()-1000).toISOString()});if(absentRetry.error)throw new Error('idempotency fixture could not be queued');
  const idempotent=worker('worker-recover');
  if(failed.retryPersisted!==true||recovered.recovered!==true||idempotent.recovered!==true)process.exitCode=1;
  console.log(JSON.stringify({provider:'ImageKit',database:'existing Supabase',fixtureScoped:true,workerFailureRetry:failed.retryPersisted===true,workerRecoveryAfterProcessRestart:recovered.recovered===true,idempotentProviderAbsenceCleanup:idempotent.recovered===true}));
 }finally{
  let providerAbsent=false;
  try{await imagekit.deleteFile(uploaded.fileId);providerAbsent=true;}catch(error){providerAbsent=statusError(error)===404;}
  if(providerAbsent){
   const job=await supabase.from('media_cleanup').delete().eq('file_id',uploaded.fileId);
   const metadata=await supabase.from('media_uploads').delete().eq('file_id',uploaded.fileId);
   if(job.error||metadata.error){console.error('Scoped media cleanup fixture metadata could not be removed.');process.exitCode=1;}
  }else{console.error('Scoped provider fixture remains in its durable media cleanup queue.');process.exitCode=1;}
 }
}
