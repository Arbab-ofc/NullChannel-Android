import { io } from 'socket.io-client';
import { API_URL } from './constants';
/** Same Socket.IO server; account channel has no room-scoped guest identity. */
export const accountSocket = io(API_URL || undefined, {autoConnect:false,withCredentials:true,transports:['websocket'],auth:{}});
