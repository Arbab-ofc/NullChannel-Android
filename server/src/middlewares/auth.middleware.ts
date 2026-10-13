import { supabase } from '../config/supabase.js';
import { verifyAccountCookie } from '../services/account.service.js';
import type { RequestHandler } from 'express';
import { env, isProd } from '../config/env.js';
import { readCookie, verifySession } from '../services/session.service.js';
import { getRoomByCode } from '../services/room.service.js';
import { isActiveMember } from '../services/membership.service.js';
import { errorResponse } from '../utils/apiResponse.js';

export const accessCookie = () => isProd ? '__Host-nc_access' : 'nc_access';
export const refreshCookie = () => isProd ? '__Host-nc_refresh' : 'nc_refresh';
export const requireOrigin: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = origin === env.CLIENT_URL || origin === env.MOBILE_APP_ORIGIN;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !allowedOrigin) {
    res.status(403).json(errorResponse('CSRF_REJECTED', 'A matching Origin header is required.')); return;
  }
  next();
};
export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    if (req.path === '/media/upload' || req.path.startsWith('/media/files/')) {
      const account = await verifyAccountCookie(req.headers.cookie);
      if (account) { res.locals.accountId = account.id; next(); return; }
    }
    const roomCode = req.path.match(/^\/rooms\/([A-Z0-9]{8})(?:\/|$)/i)?.[1];
    if (roomCode) {
      const account = await verifyAccountCookie(req.headers.cookie);
      if (account) {
        const room = await getRoomByCode(roomCode.toUpperCase());
        if (room && room.room_kind !== 'guest') {
          const { data, error } = await supabase.from('nc_room_identities').select('sender_id,alias,role').eq('room_id',room.id).eq('account_id',account.id).maybeSingle();
          if (error) throw error;
          if (!data) { res.status(403).json(errorResponse('JOIN_REQUIRED','Join this registered channel first.')); return; }
          res.locals.accountId = account.id; res.locals.identity = data.sender_id; res.locals.alias = data.alias; res.locals.roomRole = data.role;
          if (req.body && typeof req.body === 'object') { req.body.senderId = data.sender_id; if ('senderName' in req.body) req.body.senderName = data.alias; }
          next(); return;
        }
      }
    }
    const session = await verifySession(readCookie(req.headers.cookie, accessCookie()));
    if (!session) { res.status(401).json(errorResponse('SESSION_EXPIRED', 'Renew your anonymous session.')); return; }
    res.locals.identity = session.identity_id;
    // Compatibility fields are overwritten, never used as authentication evidence.
    if (req.body && typeof req.body === 'object') req.body.senderId = session.identity_id;
    if (req.params.senderId) req.params.senderId = session.identity_id;
    next();
  } catch (error) { next(error); }
};
export const requireMembership: RequestHandler = async (req, res, next) => {
  try {
    if (!/^[A-Z0-9]{8}$/i.test(String(req.params.code))) { res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid room code.')); return; }
    if (req.params.messageId && !/^[0-9a-f-]{36}$/i.test(String(req.params.messageId))) { res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid message identifier.')); return; }
    const room = await getRoomByCode(String(req.params.code).toUpperCase());
    if (!room) { res.status(404).json(errorResponse('ROOM_NOT_FOUND', 'Channel not found or expired.')); return; }
    if (!await isActiveMember(room.id, res.locals.identity)) { res.status(403).json(errorResponse('JOIN_REQUIRED', 'Join this channel first.')); return; }
    next();
  } catch (error) { next(error); }
};
