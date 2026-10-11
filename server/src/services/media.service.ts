import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { imagekit } from '../config/imagekit.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const uploadMedia = async (file: Express.Multer.File, folder: string, roomId: string, identity: string) => {
  const extension = extname(file.originalname).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
  const fileName = `${randomUUID()}${extension}`;
  const intentId = randomUUID();
  const { error } = await supabase.from('media_upload_intents').insert({ id: intentId, room_id: roomId, sender_id: identity, file_path: `${folder}/${fileName}` });
  if (error) throw error;
  const uploaded = await imagekit.upload({ file: file.buffer, fileName, folder, useUniqueFileName: false, isPrivateFile: true });
  return { fileUrl: `/api/media/files/${encodeURIComponent(uploaded.fileId)}`, filePath: uploaded.filePath, fileId: uploaded.fileId, intentId };
};
export const providerErrorStatus=(error:unknown)=>{const value=error as {statusCode?:number;$ResponseMetadata?:{statusCode?:number}};return value.statusCode??value.$ResponseMetadata?.statusCode;};
export const deleteMediaByFileId = async (fileId: string) => { try{await imagekit.deleteFile(fileId);}catch(error){if(providerErrorStatus(error)!==404)throw error;} };
export const recoverUploadIntents = async () => {
  const { data, error } = await supabase.rpc('claim_upload_intents');
  if (error) throw error;
  for (const intent of data ?? []) {
    try {
      const split = intent.file_path.lastIndexOf('/');
      const files = await imagekit.listFiles({ path: intent.file_path.slice(0, split + 1), name: intent.file_path.slice(split + 1), limit: 100 });
      for (const file of files) {
        if (file.type !== 'file' || file.filePath !== intent.file_path) continue;
        // A registered upload belongs to the normal claim/cleanup lifecycle.
        const registered = await supabase.from('media_uploads').select('file_id').eq('file_id', file.fileId).maybeSingle();
        if (registered.error) throw registered.error;
        if (!registered.data) {
          const queued = await supabase.from('media_cleanup').upsert({ file_id: file.fileId }, { onConflict: 'file_id', ignoreDuplicates: true });
          if (queued.error) throw queued.error;
        }
      }
      const removed = await supabase.from('media_upload_intents').delete().eq('id', intent.id);
      if (removed.error) throw removed.error;
    } catch {
      const attempts = intent.attempts + 1;
      const retry = await supabase.from('media_upload_intents').update({ attempts, lease_until: null, next_attempt_at: new Date(Date.now() + Math.min(3600000, 10000 * 2 ** Math.min(attempts, 10))).toISOString() }).eq('id', intent.id);
      logger.error('upload_intent_recovery_failed', { attempts, retryRecorded: !retry.error });
    }
  }
};
export const queueUnusedUpload = async (roomId: string, identity: string, filePath: string | undefined) => {
  if (!filePath) return;
  const { error } = await supabase.rpc('queue_unused_upload', { p_room: roomId, p_sender: identity, p_path: filePath });
  if (error) logger.error('unused_upload_queue_failed');
};

export const authorizeMediaDelivery=async(fileId:string,identity:string,open=false)=>{const {data,error}=await supabase.rpc('authorize_media_delivery',{p_file:fileId,p_sender:identity,p_open:open});if(error)throw error;return data?.[0]??null;};

export const consumeMediaDelivery=async(fileId:string,identity:string,open=false)=>{const {data,error}=await supabase.rpc('consume_media_delivery',{p_file:fileId,p_sender:identity,p_open:open});if(error)throw error;return data?.[0]??null;};
