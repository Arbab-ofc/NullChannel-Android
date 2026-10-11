import {Router} from 'express';
import {z} from 'zod';
import rateLimit from 'express-rate-limit';
import {requireAccount} from '../middlewares/account.middleware.js';
import {supabase} from '../config/supabase.js';
import {successResponse,errorResponse} from '../utils/apiResponse.js';
import {asyncHandler} from '../utils/asyncHandler.js';
import {registeredRpc} from './registered-room.routes.js';
import {cleanupRoomsByIds} from '../services/cleanup.service.js';
import {revokeRoomSockets,activeCallCount} from '../sockets/emitter.js';
import {socialAction} from '../services/social.service.js';
import {rateLimitHandler} from '../middlewares/rateLimit.middleware.js';
const router=Router();router.use(['/registered/privacy','/registered/sessions','/registered/rooms/:code/report','/match/rooms/:code/block'],requireAccount);
router.get('/registered/privacy',asyncHandler(async(_req,res)=>{
 const ids=await supabase.from('nc_room_identities').select('room_id').eq('account_id',res.locals.accountId);if(ids.error)throw ids.error;
 const pending=await supabase.from('nc_room_cleanup').select('state,created_at').contains('accounts',[res.locals.accountId]).limit(50);if(pending.error)throw pending.error;
 res.setHeader('Cache-Control','no-store');res.json(successResponse({activeCalls:activeCallCount((ids.data??[]).map(i=>i.room_id)),cleanup:pending.data}));
}));
router.post('/registered/sessions/end',asyncHandler(async(_req,res)=>{
 await registeredRpc('nc_match_cancel',{p_account:res.locals.accountId});
 const ids=await supabase.from('nc_room_identities').select('room_id,sender_id,role').eq('account_id',res.locals.accountId);if(ids.error)throw ids.error;
 for(const i of ids.data??[]){const r=await supabase.from('rooms').select('code,room_kind').eq('id',i.room_id).maybeSingle();if(r.error)throw r.error;if(!r.data)continue;
 if(i.role==='owner'||r.data.room_kind==='match')await cleanupRoomsByIds([i.room_id]);
 else{const left=await supabase.from('room_members').update({left_at:new Date().toISOString()}).eq('room_id',i.room_id).eq('sender_id',i.sender_id);if(left.error)throw left.error;await revokeRoomSockets(i.room_id,r.data.code,i.sender_id);}}
 res.json(successResponse({accessRevoked:true}));
}));
router.post('/registered/rooms/:code/report',rateLimit({windowMs:60000,limit:5,handler:rateLimitHandler}),asyncHandler(async(req,res)=>{
 const p=z.object({senderId:z.uuid(),reason:z.enum(['spam','harassment','unsafe_content','other'])}).safeParse(req.body);if(!p.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Choose a participant and reason.'));return;}
 const actor=await registeredRpc('nc_room_member',{p_account:res.locals.accountId,p_code:req.params.code});
 const target=await supabase.from('nc_room_identities').select('account_id').eq('room_id',actor.room_id).eq('sender_id',p.data.senderId).neq('account_id',res.locals.accountId).maybeSingle();if(target.error)throw target.error;if(!target.data){res.status(404).json(errorResponse('USER_UNAVAILABLE','This participant is unavailable.'));return;}
 const report=await supabase.from('nc_reports').insert({reporter:res.locals.accountId,subject:target.data.account_id,reason:p.data.reason});if(report.error)throw report.error;
 res.status(201).json(successResponse({reported:true,retentionDays:7,evidenceStored:false}));
}));
router.post('/match/rooms/:code/block',asyncHandler(async(req,res)=>{
 const actor=await registeredRpc('nc_room_member',{p_account:res.locals.accountId,p_code:req.params.code});
 const room=await supabase.from('rooms').select('room_kind').eq('id',actor.room_id).single();if(room.error)throw room.error;if(room.data.room_kind!=='match'){res.status(403).json(errorResponse('FORBIDDEN','Use your friends settings to manage this relationship.'));return;}
 const peer=await supabase.from('nc_room_identities').select('account_id').eq('room_id',actor.room_id).neq('account_id',res.locals.accountId).single();if(peer.error)throw peer.error;
 const result=await socialAction(res.locals.accountId,peer.data.account_id,'block');if(result.error){res.status(409).json(errorResponse('RELATIONSHIP_UNAVAILABLE','Unable to block this participant.'));return;}
 // Trigger may already have removed it; cleanup is idempotent and ensures older compatible schema revokes too.
 await cleanupRoomsByIds([actor.room_id]);await revokeRoomSockets(actor.room_id,String(req.params.code),actor.sender_id);
 res.json(successResponse({blocked:true,accessRevoked:true}));
}));
export default router;
