import type { Socket } from 'socket.io';
import { verifyAccountCookie } from '../services/account.service.js';
import { readCookie, verifySession } from '../services/session.service.js';
import { accessCookie } from '../middlewares/auth.middleware.js';
/** Revalidate credentials, not identifiers supplied by a peer. */
export const socketSessionValid = async (socket: Socket) => {
  if (socket.data.accountRoom || socket.data.socialOnly) {
    const account = await verifyAccountCookie(socket.request.headers.cookie);
    return !!account && account.id === socket.data.accountId;
  }
  const session = await verifySession(readCookie(socket.request.headers.cookie,accessCookie()));
  return !!session && session.id === socket.data.sessionId && session.identity_id === socket.data.identity;
};
