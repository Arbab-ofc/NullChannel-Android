import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { mobileAccountActive, verifyMobileAccess } from '../services/mobile-auth.service.js';
import { pushDevices } from '../services/push.service.js';
import { currentCallRegistry } from '../sockets/emitter.js';
import { getRoomByCode } from '../services/room.service.js';
import { isActiveMember } from '../services/membership.service.js';
import { errorResponse, successResponse } from '../utils/apiResponse.js';
import { rateLimitHandler } from '../middlewares/rateLimit.middleware.js';
const router=Router();
router.use('/mobile/push',rateLimit({windowMs:60000,limit:60,handler:rateLimitHandler}), (req,res,next)=>{if(req.headers.origin!==env.MOBILE_APP_ORIGIN){res.status(403).json(errorResponse('MOBILE_ORIGIN_REQUIRED','Use the Android app.'));return;}next();});
const registration=z.strictObject({deviceId:z.uuid(),token:z.string().min(20).max(4096),secret:z.string().regex(/^[a-f0-9]{64}$/)});
router.put('/mobile/push/devices',async(req,res,next)=>{try{
 const principal=await verifyMobileAccess(req.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]);
 if(!principal || principal.accountId&&!await mobileAccountActive(principal.accountId)){res.status(401).json(errorResponse('SESSION_EXPIRED','Renew your session.'));return;}
 const body=registration.safeParse(req.body);if(!body.success){res.status(400).json(errorResponse('VALIDATION_ERROR','Invalid push registration.'));return;}
 await pushDevices.register(body.data.deviceId,body.data.token,body.data.secret,principal);res.json(successResponse({registered:true}));
 }catch(error){if((error as Error).message==='DEVICE_OWNERSHIP'){res.status(403).json(errorResponse('DEVICE_OWNERSHIP','Device registration is unavailable.'));return;}next(error);}});
router.use('/mobile/push/devices/:deviceId',async(req,res,next)=>{try{const secret=req.get('X-NC-Device-Secret')??'';const record=await pushDevices.authenticate(String(req.params.deviceId),secret);if(!record){res.status(401).json(errorResponse('SESSION_EXPIRED','Device session ended.'));return;}res.locals.pushDevice=record;next();}catch(error){next(error);}});
router.delete('/mobile/push/devices/:deviceId',async(req,res,next)=>{try{await pushDevices.remove(String(req.params.deviceId));res.json(successResponse({revoked:true}));}catch(error){next(error);}});
router.post('/mobile/push/devices/:deviceId/token',async(req,res,next)=>{try{const token=z.string().min(20).max(4096).safeParse(req.body.token);if(!token.success){res.status(400).end();return;}const record=res.locals.pushDevice;await pushDevices.register(record.deviceId,token.data,String(req.get('X-NC-Device-Secret')),record.principal);res.json(successResponse({rotated:true}));}catch(error){next(error);}});
router.post('/mobile/push/devices/:deviceId/verify',async(req,res,next)=>{try{
 const record=res.locals.pushDevice;const code=String(req.body.roomCode??'');if(!/^[A-Z0-9]{8}$/.test(code)){res.status(400).end();return;}
 const room=await getRoomByCode(code),identity=room?await pushDevices.identity(record,room.id):null;
 if(!room || Date.parse(room.expires_at)<=Date.now() || !identity || !await isActiveMember(room.id,identity)){res.status(410).end();return;}
 if(req.body.callId){if(req.body.action==='end'&&await currentCallRegistry()?.canControl(record.principal,String(req.body.callId))){await currentCallRegistry()?.end(String(req.body.callId),'hangup');res.json(successResponse({ended:true}));return;}const invitation=await currentCallRegistry()?.invitation(record.principal,String(req.body.callId));if(!invitation || invitation.roomCode!==code){res.status(410).end();return;}
  if(req.body.action==='decline')await currentCallRegistry()?.end(invitation.callId,'declined');else if(req.body.action==='ringing')await currentCallRegistry()?.ringing(invitation.callId);
  res.json(successResponse(invitation));return;}
 res.json(successResponse({valid:true,expiresAt:Date.parse(room.expires_at)}));
 }catch(error){next(error);}});
export default router;
