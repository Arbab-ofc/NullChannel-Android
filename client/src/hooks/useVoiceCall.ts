import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Socket } from 'socket.io-client';
import {roomVoiceCall,releaseRoomCall,retainRoomCall} from '../lib/active-calls';
import { nativeAndroid } from '../lib/native-calls';
export const useVoiceCall = (socket: Socket, code: string, eligible: boolean, expiresAt?: string,ready=true) => {
  const call = useMemo(() => roomVoiceCall(socket,code),[socket,code]);
  const view = useSyncExternalStore(call.subscribe,call.snapshot,call.snapshot);
  useEffect(() => {
    retainRoomCall(call);call.attach(); const hide = () => {if(!nativeAndroid())call.end();};window.addEventListener('pagehide',hide);
    return () => { window.removeEventListener('pagehide',hide);call.setVisible(false); releaseRoomCall(call); };
  },[call]);
  useEffect(() => { call.setVisible(ready);if(ready&&(eligible||expiresAt))call.setRoom(eligible,expiresAt); },[call,eligible,expiresAt,ready]);
  return { call,view };
};
