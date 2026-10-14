import {configureDistributedCalls,distributedCallsHealthy} from './distributed.js';
import { randomUUID } from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { getRoomByCode } from '../services/room.service.js';
import { verifyAccountCookie } from '../services/account.service.js';
import { attachAccountPresence } from '../services/presence.service.js';
import { socketSessionValid } from './auth.js';
import { isIP } from 'node:net';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { registerCallSocket } from './call.socket.js';
import { registerRoomSocket } from './room.socket.js';
import { setSocketServer } from './emitter.js';
import { readCookie, verifySession } from '../services/session.service.js';
import { accessCookie } from '../middlewares/auth.middleware.js';
import { allowEvent } from './rateLimit.js';
import { mobileAccountActive, verifyMobileAccess } from '../services/mobile-auth.service.js';

const connectionAddress = (req: IncomingMessage) => {
  const peer = req.socket.remoteAddress ?? 'unknown';
  const forwarded = req.headers['x-forwarded-for'];
  // The dedicated Nginx location overwrites this header with a single real client IP.
  return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer) && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : peer;
};
export const createSocketServer = (server: HttpServer) => {
  const io = new Server(server, {
    cors: { origin: [env.CLIENT_URL, env.MOBILE_APP_ORIGIN], credentials: true },
    maxHttpBufferSize: 64 * 1024,
    allowRequest: (req, callback) => callback(null, (req.headers.origin === env.CLIENT_URL || req.headers.origin === env.MOBILE_APP_ORIGIN) && allowEvent(`connect:${connectionAddress(req)}`, env.SOCKET_CONNECTION_LIMIT))
  });

  const distributedReady=configureDistributedCalls(io);
  io.use(async (socket, next) => {
    try {
      socket.data.callProtocol=socket.handshake.auth.callProtocol===2||socket.handshake.auth.callProtocol==='2'?2:1;
      await distributedReady;if(!await distributedCallsHealthy(io))return next(new Error('SESSION_UNAVAILABLE'));
      if(socket.handshake.headers.origin===env.MOBILE_APP_ORIGIN){
        const auth=socket.handshake.auth as {accountToken?:unknown;guestToken?:unknown;roomCode?:unknown;globalCalls?:unknown};
        const roomCode=typeof auth.roomCode==='string'?auth.roomCode.toUpperCase():'';
        const account=await verifyMobileAccess(auth.accountToken);
        if(account?.accountId&&await mobileAccountActive(account.accountId)){
          if(!roomCode){socket.data.accountId=account.accountId;socket.data.mobileSessionId=account.id;socket.data.identity=randomUUID();socket.data.socialOnly=true;next();return;}
          const room=await getRoomByCode(roomCode);
          if(room&&room.room_kind!=='guest'){
            const mapping=await supabase.from('nc_room_identities').select('sender_id,alias,role').eq('room_id',room.id).eq('account_id',account.accountId).maybeSingle();
            if(mapping.error||!mapping.data)return next(new Error('JOIN_REQUIRED'));
            socket.data.accountId=account.accountId;socket.data.mobileSessionId=account.id;socket.data.identity=mapping.data.sender_id;socket.data.alias=mapping.data.alias;socket.data.roomRole=mapping.data.role;socket.data.accountRoom=room.id;next();return;
          }
        }
        if(!roomCode&&auth.globalCalls===true){const guest=await verifyMobileAccess(auth.guestToken);if(guest?.identityId){socket.data.identity=guest.identityId;socket.data.mobileSessionId=guest.id;socket.data.globalCalls=true;next();return;}}
        if(!roomCode)return next(new Error('SESSION_EXPIRED'));
        const guest=await verifyMobileAccess(auth.guestToken);
        if(guest?.identityId){socket.data.identity=guest.identityId;socket.data.mobileSessionId=guest.id;next();return;}
        return next(new Error('SESSION_EXPIRED'));
      }
      const account = await verifyAccountCookie(socket.request.headers.cookie);
      if (account) {
        socket.data.accountId = account.id;
        const code = typeof socket.handshake.auth.roomCode === 'string' ? socket.handshake.auth.roomCode.toUpperCase() : '';
        if (!code) { socket.data.identity = randomUUID(); socket.data.socialOnly = true; next(); return; }
        const room = await getRoomByCode(code);
        if (room && room.room_kind !== 'guest') {
          const mapping = await supabase.from('nc_room_identities').select('sender_id,alias,role').eq('room_id',room.id).eq('account_id',account.id).maybeSingle();
          if (mapping.error || !mapping.data) return next(new Error('JOIN_REQUIRED'));
          socket.data.identity = mapping.data.sender_id; socket.data.alias = mapping.data.alias; socket.data.roomRole = mapping.data.role; socket.data.accountRoom = room.id;
          next(); return;
        }
      }
      const session = await verifySession(readCookie(socket.request.headers.cookie, accessCookie()));
      if (!session) return next(new Error('SESSION_EXPIRED'));
      socket.data.identity = session.identity_id;
      socket.data.sessionId = session.id;
      next();
    } catch { next(new Error('SESSION_UNAVAILABLE')); }
  });

  io.on('connection', (socket) => {
    if(socket.data.globalCalls)void socket.join(`identity:${socket.data.identity}`);
    if (socket.data.accountId) void attachAccountPresence(io,socket,socket.data.accountId).catch(() => socket.disconnect(true));
    const sessionWatch = setInterval(async () => {
      try {
        if (!await socketSessionValid(socket)) socket.disconnect(true);
      } catch { socket.disconnect(true); }
    }, 15000);
    sessionWatch.unref();
    socket.once('disconnect', () => clearInterval(sessionWatch));
    socket.emit('connection-status', { connected: true });
    registerRoomSocket(io, socket);
    registerCallSocket(io, socket);
  });

  setSocketServer(io);
  return io;
};
