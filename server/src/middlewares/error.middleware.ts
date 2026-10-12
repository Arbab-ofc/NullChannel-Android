import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger.js';
export const errorMiddleware = (err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
  const known: Record<string,{status:number,message:string}> = {
    AUTH_UNAVAILABLE:{status:503,message:'Account verification is temporarily unavailable. Please retry.'}, INVITATION_PENDING:{status:409,message:'Invitation already pending'}, ACTIVE_DIRECT_ROOM:{status:409,message:'A temporary conversation is already active.'}, INVITATION_COOLDOWN:{status:409,message:'Please wait before inviting this friend again.'}, MATCH_DISABLED:{status:403,message:'Enable matchmaking in privacy settings first.'}, PRESENCE_REQUIRED:{status:409,message:'Connect and set your presence online before searching.'},
    ROOM_BANNED:{status:403,message:'You cannot rejoin this channel.'}, POLL_CLOSED:{status:409,message:'This poll has closed.'}, POLL_LIMIT:{status:429,message:'This channel has reached its poll limit.'},
    ROOM_LIMIT_REACHED:{status:429,message:'You have reached the active room limit.'}, FRIENDSHIP_REQUIRED:{status:403,message:'A friendship is required for this invitation.'},
    USER_UNAVAILABLE:{status:409,message:'This participant is unavailable.'}, INVITATION_LIMIT:{status:429,message:'Too many active invitations. Please wait.'},
    ROOM_NOT_FOUND:{status:404,message:'Channel not found or expired.'}, ROOM_FULL:{status:409,message:'This channel is full.'},
    FORBIDDEN:{status:403,message:'You do not have permission for this action.'}, JOIN_REQUIRED:{status:403,message:'Join this channel first.'},
    ACCOUNT_REQUIRED:{status:401,message:'Sign in to continue.'}, MATCH_INELIGIBLE:{status:409,message:'You are unavailable for matching. Check your preferences and connection.'},
    PROPOSAL_EXPIRED:{status:409,message:'This match proposal has expired.'}, INVITATION_EXPIRED:{status:410,message:'This invitation has expired.'},
    INVALID_TOKEN:{status:410,message:'This invitation is invalid, expired or already used.'}, MUTED:{status:403,message:'You are temporarily muted in this channel.'},
    BANNED:{status:403,message:'You cannot rejoin this channel.'}, VALIDATION_ERROR:{status:400,message:'Check the request fields.'}
  };
  const code = Object.keys(known).find(value => err.message?.includes(value));
  if (code) { res.status(known[code].status).json({success:false,data:null,error:{code,message:known[code].message}}); return; }
  const oversized = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
  const status = oversized || err.status === 413 ? 413 : err instanceof multer.MulterError || err.status === 400 ? 400 : 500;
  logger.error('request_failed', { status, errorType: err.name, errorCode: err.code && /^[A-Z0-9_]{1,40}$/.test(err.code) ? err.code : undefined, requestId: res.locals.requestId });
  res.status(status).json({ success: false, data: null, error: { code: status === 413 ? 'UPLOAD_TOO_LARGE' : status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: status === 413 ? 'Upload exceeds the 15 MiB limit.' : status === 400 ? 'Invalid request.' : 'Internal server error.' } });
};
