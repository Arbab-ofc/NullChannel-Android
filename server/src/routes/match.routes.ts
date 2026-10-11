import { supabase } from '../config/supabase.js';
import { emitAccountEvent } from '../services/presence.service.js';
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { requireAccount } from '../middlewares/account.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { successResponse,errorResponse } from '../utils/apiResponse.js';
import { generateCode } from '../utils/generateCode.js';
import { publishMatchStatuses } from '../services/registered-realtime.service.js';
import { rateLimitHandler } from '../middlewares/rateLimit.middleware.js';
import { registeredRpc } from './registered-room.routes.js';
const router=Router();
router.use('/match',requireAccount);
router.use('/match',rateLimit({handler:rateLimitHandler,windowMs:60000,limit:90,keyGenerator:(_req,res)=>String(res.locals.accountId)}));
router.post('/match/start',asyncHandler(async(_req,res)=>{const status=await registeredRpc('nc_match_start',{p_account:res.locals.accountId});await publishMatchStatuses([res.locals.accountId]);res.json(successResponse(status));}));
router.get('/match/status',asyncHandler(async(_req,res)=>{res.json(successResponse(await registeredRpc('nc_match_status',{p_account:res.locals.accountId})));}));
router.post('/match/cancel',asyncHandler(async(_req,res)=>{await registeredRpc('nc_match_cancel',{p_account:res.locals.accountId});res.json(successResponse({state:'idle'}));}));
router.post('/match/proposals/:id/:action',asyncHandler(async(req,res)=>{const p=z.object({id:z.uuid(),action:z.enum(['accept','reject'])}).safeParse(req.params);if(!p.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Invalid proposal action.'));return;}const status=await registeredRpc('nc_match_respond',{p_account:res.locals.accountId,p_proposal:p.data.id,p_accept:p.data.action==='accept',p_code:generateCode()});await publishMatchStatuses([res.locals.accountId]);res.json(successResponse(status));}));
router.post('/match/rooms/:code/consent',asyncHandler(async(req,res)=>{const p=z.object({purpose:z.enum(['reveal','connect']),accept:z.boolean()}).safeParse(req.body);if(!p.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Invalid consent.'));return;}const result=await registeredRpc('nc_room_consent',{p_account:res.locals.accountId,p_code:req.params.code,p_purpose:p.data.purpose,p_accept:p.data.accept});
const member=await registeredRpc('nc_room_member',{p_account:res.locals.accountId,p_code:req.params.code});
const participants=await supabase.from('nc_room_identities').select('account_id').eq('room_id',member.room_id);if(participants.error)throw participants.error;
for(const participant of participants.data??[]){
 if(result.mutual){
  const peer=participants.data?.find(other=>other.account_id!==participant.account_id);
  if(peer){const profile=await supabase.from('profiles').select('username,display_name').eq('id',peer.account_id).single();if(profile.error)throw profile.error;emitAccountEvent(participant.account_id,'identity:consent',{code:req.params.code,purpose:p.data.purpose,status:'mutual',profile:profile.data,connected:p.data.purpose==='connect'});}
 }else if(participant.account_id!==res.locals.accountId)emitAccountEvent(participant.account_id,'identity:consent',{code:req.params.code,purpose:p.data.purpose,status:p.data.accept?'requested':'declined'});
}
res.json(successResponse(result));}));
export const sweepRegisteredEphemera=async()=>{await registeredRpc('nc_match_sweep',{});await publishMatchStatuses();};
export default router;
