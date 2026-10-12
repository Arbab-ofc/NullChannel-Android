import {emitAccountEvent} from './presence.service.js';
import { recoverAvatarIntents } from './avatar.service.js';
import { supabase } from '../config/supabase.js';
import { emitMessageBurned, emitRoomExpired, emitRoomExpiredByCode, emitDirectoryUpdated } from '../sockets/emitter.js';
import { deleteMediaByFileId, recoverUploadIntents } from './media.service.js';
import { logger } from '../utils/logger.js';

export const cleanupRoomsByIds = async (roomIds: string[]) => {
  if (!roomIds.length) return { removedRooms: 0 };
  // Database triggers durably queue media before cascade deletion.
  const before = await supabase.from('rooms').select('id,code,room_kind').in('id',roomIds);
  if (before.error) throw before.error;
  const registeredIds=(before.data??[]).filter(room=>room.room_kind&&room.room_kind!=='guest').map(room=>room.id);
  const accounts=registeredIds.length?await supabase.from('nc_room_identities').select('account_id').in('room_id',registeredIds):{data:[],error:null};if(accounts.error)throw accounts.error;
  const { error, count } = await supabase.from('rooms').delete({ count: 'exact' }).in('id', roomIds);
  if (error) throw error;
  for (const room of before.data ?? []) { emitRoomExpiredByCode(room.code,{reason:'terminated-by-creator'}); emitRoomExpired(room.id,{reason:'terminated-by-creator'}); }
  for(const id of new Set((accounts.data??[]).map(i=>i.account_id)))emitAccountEvent(id,'rooms:updated',{updated:true});
  emitDirectoryUpdated();
  return { removedRooms: count ?? 0 };
};
export const processMediaCleanup = async () => {
  const { data, error } = await supabase.rpc('claim_media_cleanup');
  if (error) throw error;
  for (const item of data ?? []) {
    try {
      try { await deleteMediaByFileId(item.file_id); }
      catch (failure) { if ((failure as { statusCode?: number }).statusCode !== 404) throw failure; }
      const deletedUpload = await supabase.from('media_uploads').delete().eq('file_id', item.file_id);
      if (deletedUpload.error) throw deletedUpload.error;
      const deletedJob = await supabase.from('media_cleanup').delete().eq('file_id', item.file_id);
      if (deletedJob.error) throw deletedJob.error;
    } catch {
      const attempts = item.attempts + 1;
      const { error: retryError } = await supabase.from('media_cleanup').update({ attempts, lease_until: null, next_attempt_at: new Date(Date.now() + Math.min(3600000, 10000 * 2 ** Math.min(attempts, 10))).toISOString() }).eq('file_id', item.file_id);
      logger.error('media_cleanup_failed', { attempts, retryRecorded: !retryError });
    }
  }
};
let running = false;
export const cleanupExpiredRooms = async () => {
  if (running) return { removedRooms: 0 };
  running = true;
  try {
    const { data: rooms, error } = await supabase.rpc('cleanup_expired_rooms');
    if (error) throw error;
    for (const room of rooms ?? []) {
      emitRoomExpiredByCode(room.code, { reason: 'expired' });
      emitRoomExpired(room.id, { reason: 'expired' });
    }
    if (rooms?.length) emitDirectoryUpdated();
    const pairs=await supabase.rpc('nc_direct_pairs_sweep');if(pairs.error)throw pairs.error;
    await recoverUploadIntents();
    await recoverAvatarIntents();
    await processMediaCleanup();
    const removedRooms = rooms?.length ?? 0;
    logger.info('cleanup_complete', { removedRooms });
    return { removedRooms };
  } finally { running = false; }
};

let burning = false;
export const cleanupBurnMessages = async () => {
  if (burning) return;
  burning = true;
  try {
    const { data, error } = await supabase.rpc('cleanup_burn_messages');
    if (error) throw error;
    for (const message of data ?? []) emitMessageBurned(message.room_id, { messageId: message.id });
    const timed = await supabase.rpc('cleanup_timed_messages');
    if (timed.error) throw timed.error;
    for (const message of timed.data ?? []) emitMessageBurned(message.room_id, { messageId: message.id });
  } finally { burning = false; }
};

export const reconcileRoomCleanup = async () => {
  const { data, error } = await supabase.from('nc_room_cleanup').select('id,media_ids').limit(100);
  if (error) throw error;
  for (const job of data ?? []) {
    const queued = await supabase.from('media_cleanup').select('file_id,attempts').in('file_id',job.media_ids);
    if (queued.error) throw queued.error;
    const uploads = await supabase.from('media_uploads').select('file_id').in('file_id',job.media_ids);
    if (uploads.error) throw uploads.error;
    const result = !queued.data?.length && !uploads.data?.length
      ? await supabase.from('nc_room_cleanup').delete().eq('id',job.id)
      : await supabase.from('nc_room_cleanup').update({state: queued.data?.some(item => item.attempts >= 10) ? 'cleanup_failed' : 'media_cleanup_pending'}).eq('id',job.id);
    if (result.error) throw result.error;
  }
};
