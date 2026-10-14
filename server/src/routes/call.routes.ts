import { currentCallRegistry } from '../sockets/emitter.js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createTurnCredential, env } from '../config/env.js';
import { requireMembership } from '../middlewares/auth.middleware.js';
import { getRoomByCode } from '../services/room.service.js';
import { isActiveMember } from '../services/membership.service.js';
import { errorResponse, successResponse } from '../utils/apiResponse.js';
import { rateLimitHandler } from '../middlewares/rateLimit.middleware.js';

const router = Router();
const iceCredentialLimit = rateLimit({ handler: rateLimitHandler, windowMs: 60_000, limit: 30, keyGenerator:(_req,res)=>String(res.locals.accountId??res.locals.identity) });

router.get('/rooms/:code/calls/ice-servers', iceCredentialLimit, requireMembership, async (req, res, next) => {
  try {
    const code = String(req.params.code).toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(code)) { res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid room code.')); return; }
    const room = await getRoomByCode(code);
    if (!room || Date.parse(room.expires_at) <= Date.now()) { res.status(404).json(errorResponse('ROOM_EXPIRED', 'This room is unavailable or expired.')); return; }
    if (room.room_type !== 'private' || !await isActiveMember(room.id, res.locals.identity)) {
      res.status(403).json(errorResponse('JOIN_REQUIRED', 'Join an eligible private room before requesting voice credentials.')); return;
    }
    const expiresAt = Math.floor(Date.now() / 1000) + env.TURN_CREDENTIAL_TTL_SECONDS;
    res.json(successResponse({ iceServers: createTurnCredential(), expiresAt }));
  } catch (error) { next(error); }
});

router.get('/rooms/:code/calls/:callId/invitation',iceCredentialLimit,requireMembership,(req,res)=>{
 const invitation=currentCallRegistry()?.invitation({accountId:res.locals.accountId??null,identityId:res.locals.identity??null},String(req.params.callId));
 if(!invitation||invitation.roomCode!==String(req.params.code).toUpperCase()){res.status(410).json(errorResponse('INVITATION_EXPIRED','This invitation has expired.'));return;}
 res.json(successResponse({...invitation,protocol:2}));
});
router.get('/rooms/:code/calls/:callId/state',iceCredentialLimit,requireMembership,(req,res)=>{
 const state=currentCallRegistry()?.authorizedSnapshot({accountId:res.locals.accountId??null,identityId:res.locals.identity??null},String(req.params.callId));
 if(!state){res.status(410).json(errorResponse('INVALID_CALL','Call ended.'));return;}res.json(successResponse(state));
});
export default router;
