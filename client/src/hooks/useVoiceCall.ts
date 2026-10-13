import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Socket } from 'socket.io-client';
import {roomVoiceCall,releaseRoomCall,retainRoomCall} from '../lib/active-calls';
import { IS_NATIVE_APP } from '../lib/constants';
export const useVoiceCall = (socket: Socket, code: string, eligible: boolean, expiresAt?: string,ready=true) => {
  const call = useMemo(() => roomVoiceCall(socket,code),[socket,code]);
  const view = useSyncExternalStore(call.subscribe,call.snapshot,call.snapshot);
  useEffect(() => {
    retainRoomCall(call);call.attach(); const hide = () => call.end();const appState=()=>{if(IS_NATIVE_APP&&document.hidden)hide();};window.addEventListener('pagehide',hide);document.addEventListener('visibilitychange',appState);window.addEventListener('nullchannel-app-pause',hide);
    return () => { window.removeEventListener('pagehide',hide);document.removeEventListener('visibilitychange',appState);window.removeEventListener('nullchannel-app-pause',hide);call.setVisible(false); releaseRoomCall(call); };
  },[call]);
  useEffect(() => { call.setVisible(ready);if(ready&&(eligible||expiresAt))call.setRoom(eligible,expiresAt); },[call,eligible,expiresAt,ready]);
  return { call,view };
};
