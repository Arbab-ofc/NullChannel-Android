import {randomUUID} from 'node:crypto';
import type {Express} from 'express';
import {imagekit} from '../config/imagekit.js';
import {supabase} from '../config/supabase.js';
import {logger} from '../utils/logger.js';
import {validSignature} from './media-validation.js';
export const avatarUrl=(username:string,hasAvatar:unknown)=>hasAvatar?`/api/account/avatars/${encodeURIComponent(username)}`:null;
export const validAvatar=(file:Express.Multer.File)=>file.size<=2*1024*1024&&['image/png','image/jpeg','image/webp'].includes(file.mimetype)&&validSignature(file.buffer,file.mimetype);
export const uploadAvatar=async(account:string,file:Express.Multer.File)=>{
 const extensions:Record<string,string>={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'};
 const id=randomUUID(),folder='/nullchannel/profiles',fileName=`${randomUUID()}${extensions[file.mimetype]}`,path=`${folder}/${fileName}`;
 const intent=await supabase.from('profile_avatar_intents').insert({id,account_id:account,file_path:path});if(intent.error)throw intent.error;
 const uploaded=await imagekit.upload({file:file.buffer,fileName,folder,useUniqueFileName:false,isPrivateFile:true});
 const committed=await supabase.rpc('commit_profile_avatar',{p_account:account,p_intent:id,p_file_id:uploaded.fileId,p_path:uploaded.filePath});if(committed.error)throw committed.error;
};
export const clearAvatar=async(account:string)=>{const {error}=await supabase.rpc('commit_profile_avatar',{p_account:account,p_intent:null,p_file_id:null,p_path:null});if(error)throw error;};
/** Upload intent precedes external provider write; failed commits and interrupted uploads survive restart. */
export const recoverAvatarIntents=async()=>{
 const {data,error}=await supabase.rpc('claim_profile_avatar_intents');if(error)throw error;
 for(const intent of data??[]){try{
 const split=intent.file_path.lastIndexOf('/');const files=await imagekit.listFiles({path:intent.file_path.slice(0,split+1),name:intent.file_path.slice(split+1),limit:100});
 for(const file of files){if(file.type!=='file'||file.filePath!==intent.file_path)continue;
 const current=await supabase.from('profiles').select('username').eq('avatar_file_id',file.fileId).maybeSingle();if(current.error)throw current.error;
 if(!current.data){const queued=await supabase.from('media_cleanup').upsert({file_id:file.fileId},{onConflict:'file_id',ignoreDuplicates:true});if(queued.error)throw queued.error;}
 }
 const removed=await supabase.from('profile_avatar_intents').delete().eq('id',intent.id);if(removed.error)throw removed.error;
 }catch{const attempts=intent.attempts+1;const retry=await supabase.from('profile_avatar_intents').update({attempts,lease_until:null,next_attempt_at:new Date(Date.now()+Math.min(3600000,10000*2**Math.min(attempts,10))).toISOString()}).eq('id',intent.id);logger.error('avatar_intent_recovery_failed',{attempts,retryRecorded:!retry.error});}}
};
