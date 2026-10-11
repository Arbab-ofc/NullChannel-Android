import axios from 'axios';
import { imagekit } from '../config/imagekit.js';
import { env } from '../config/env.js';
import { verifyAccountCookie } from '../services/account.service.js';
import { logger } from '../utils/logger.js';
import type { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { normalizeMediaType, validSignature } from '../services/media-validation.js';
import { mediaBodySchema } from '../schemas/media.schema.js';
import { authorizeMediaDelivery, consumeMediaDelivery, deleteMediaByFileId, uploadMedia } from '../services/media.service.js';
import { getRoomByCode } from '../services/room.service.js';
import { isActiveMember } from '../services/membership.service.js';
import { LIMITS } from '../constants/limits.js';
import { errorResponse, successResponse } from '../utils/apiResponse.js';

const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const voiceTypes = ['audio/webm', 'audio/mpeg', 'audio/mp3', 'audio/wav'];
const fileTypes = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export const uploadMediaController = async (req: Request, res: Response) => {
  // Multipart fields exist only after multer; derive registered identity from the authorized room.
  if (typeof req.body.roomCode === 'string') {
    const account = await verifyAccountCookie(req.headers.cookie);
    if (account) {
      const room = await getRoomByCode(req.body.roomCode.toUpperCase());
      if (room && room.room_kind !== 'guest') {
        const mapping = await supabase.from('nc_room_identities').select('sender_id').eq('room_id',room.id).eq('account_id',account.id).maybeSingle();
        if (mapping.error) throw mapping.error;
        if (!mapping.data) { res.status(403).json(errorResponse('JOIN_REQUIRED','Join this channel first.')); return; }
        res.locals.identity = mapping.data.sender_id;
      }
    }
  }
  req.body.senderId = res.locals.identity;
  const parsed = mediaBodySchema.safeParse(req.body);
  if (!parsed.success || !req.file) {
    res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid upload request.'));
    return;
  }

  const room = await getRoomByCode(parsed.data.roomCode);
  if (!room) {
    res.status(404).json(errorResponse('ROOM_NOT_FOUND', 'Channel not found or expired.'));
    return;
  }

  const activeMember = await isActiveMember(room.id, parsed.data.senderId);
  if (!activeMember) {
    res.status(403).json(errorResponse('JOIN_REQUIRED', 'Join this channel before sending media.'));
    return;
  }

  req.file.mimetype = normalizeMediaType(req.file.mimetype, req.file.originalname);
  const allowed = parsed.data.type === 'image' ? imageTypes : parsed.data.type === 'voice' ? voiceTypes : fileTypes;
  const max = parsed.data.type === 'image' ? LIMITS.IMAGE_MAX_BYTES : parsed.data.type === 'voice' ? LIMITS.VOICE_MAX_BYTES : LIMITS.FILE_MAX_BYTES;

  if (!allowed.includes(req.file.mimetype) || req.file.size > max || !validSignature(req.file.buffer, req.file.mimetype)) {
    res.status(400).json(errorResponse('INVALID_MEDIA', 'Invalid media format or size.'));
    return;
  }

  const uploaded = await uploadMedia(req.file, `/nullchannel/${room.code.toLowerCase()}`, room.id, res.locals.identity);
  const { error } = await supabase.from('media_uploads').insert({ file_id: uploaded.fileId, room_id: room.id, sender_id: res.locals.identity, file_url: uploaded.fileUrl, file_path: uploaded.filePath, file_name: req.file.originalname.slice(0, 240), file_size: req.file.size, mime_type: req.file.mimetype, private_delivery:true, media_type: parsed.data.type });
  if (error) {
    try { await deleteMediaByFileId(uploaded.fileId); } catch { throw new Error('Upload registry failed and remote rollback failed'); }
    throw error;
  }
  const removedIntent = await supabase.from('media_upload_intents').delete().eq('id', uploaded.intentId);
  if (removedIntent.error) logger.error('upload_intent_finalize_failed');
  if (req.aborted || res.destroyed) {
    const { error: queueError } = await supabase.from('media_cleanup').upsert({ file_id: uploaded.fileId });
    if (queueError) throw queueError;
    return;
  }
  res.json(successResponse({ fileUrl: uploaded.fileUrl, filePath: uploaded.filePath, fileId: uploaded.fileId }));
};

export const downloadMediaController=async(req:Request,res:Response)=>{
 const fileId=String(req.params.fileId);if(!/^[A-Za-z0-9_-]{1,128}$/.test(fileId)){res.status(404).json(errorResponse('MEDIA_UNAVAILABLE','Attachment unavailable.'));return;}
 const upload=await supabase.from('media_uploads').select('room_id').eq('file_id',fileId).maybeSingle();if(upload.error)throw upload.error;
 if(!upload.data?.room_id){res.status(404).json(errorResponse('MEDIA_UNAVAILABLE','Attachment unavailable.'));return;}
 let identity=res.locals.identity;
 const account=await verifyAccountCookie(req.headers.cookie);
 if(account){const mapping=await supabase.from('nc_room_identities').select('sender_id').eq('room_id',upload.data.room_id).eq('account_id',account.id).maybeSingle();if(mapping.error)throw mapping.error;if(mapping.data)identity=mapping.data.sender_id;}
 if(!identity){res.status(404).json(errorResponse('MEDIA_UNAVAILABLE','Attachment unavailable.'));return;}
 const opening=req.method==='GET'&&String(req.query.open??'')==='1';
 const authorized=await authorizeMediaDelivery(fileId,identity,opening);
 if(!authorized){res.status(404).json(errorResponse('MEDIA_UNAVAILABLE','Attachment unavailable or expired.'));return;}
 if(req.method==='HEAD'){res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type',authorized.mime_type);res.end();return;}
 // The signed provider URL is used exclusively server-side and never redirected to the browser.
 const signed=imagekit.url({path:authorized.file_path,signed:true,expireSeconds:30});
 let provider;try{provider=await axios.get(signed,{responseType:'arraybuffer',maxRedirects:0,maxContentLength:LIMITS.FILE_MAX_BYTES,timeout:env.IMAGEKIT_TIMEOUT_MS});}catch(error){const failure=error as {code?:unknown;response?:{status?:unknown;headers?:Record<string,unknown>}};const diagnostic=String(failure.response?.headers?.['ik-error']??'').split(/\s+-\s+/)[0];const requestId=String(failure.response?.headers?.['x-request-id']??failure.response?.headers?.['x-ik-request-id']??'');logger.error('media_delivery_provider_failed',{provider_status:typeof failure.response?.status==='number'?failure.response.status:undefined,provider_code:/^[A-Z0-9_]{1,32}$/.test(diagnostic)?diagnostic:undefined,provider_request_id:/^[A-Za-z0-9_-]{1,80}$/.test(requestId)?requestId:undefined,network_code:typeof failure.code==='string'&&/^[A-Z0-9_]{1,32}$/.test(failure.code)?failure.code:undefined});res.status(503).json(errorResponse('MEDIA_DELIVERY_UNAVAILABLE','Attachment storage is temporarily unavailable.'));return;}
 // Recheck after provider latency: expiry, deletion or membership loss while fetching must revoke delivery.
 if(!await consumeMediaDelivery(fileId,identity,opening)){res.status(404).json(errorResponse('MEDIA_UNAVAILABLE','Attachment unavailable or expired.'));return;}
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Type',authorized.mime_type);
 const inline=authorized.mime_type.startsWith('image/')||authorized.mime_type.startsWith('audio/');
 const safeName=authorized.file_name.replace(/[\r\n"\\/]/g,'_').replace(/[^\x20-\x7E]/g,'_').slice(0,120)||'attachment';
 res.setHeader('Content-Disposition',`${inline?'inline':'attachment'}; filename="${safeName}"`);
 res.send(Buffer.from(provider.data));
};
