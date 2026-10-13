import {activeCallSnapshot} from '../lib/active-calls';
import { useEffect,useMemo } from 'react';
import { socket,isolatedRoomSocket,connectRoomTransport,disconnectRoomTransport } from '../lib/socket';
export const useSocket = (roomCode: string) => {
  const transport=useMemo(()=>{const active=activeCallSnapshot();return active?active.roomCode===roomCode.toUpperCase()?active.signalingSocket:isolatedRoomSocket(roomCode):socket;},[roomCode]);
  useEffect(() => {
    transport.auth = { roomCode };
    if(!transport.connected)connectRoomTransport(transport);
    const resume=()=>{if(!document.hidden&&!transport.connected)connectRoomTransport(transport);};document.addEventListener('visibilitychange',resume);window.addEventListener('nullchannel-app-resume',resume);
    return () => {document.removeEventListener('visibilitychange',resume);window.removeEventListener('nullchannel-app-resume',resume); if(activeCallSnapshot()?.roomCode!==roomCode.toUpperCase())disconnectRoomTransport(transport); };
  }, [roomCode,transport]);
  return transport;
};
