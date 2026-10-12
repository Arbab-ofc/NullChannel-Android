import {activeCallSnapshot} from '../lib/active-calls';
import { useEffect,useMemo } from 'react';
import { socket,isolatedRoomSocket,connectRoomTransport,disconnectRoomTransport } from '../lib/socket';
export const useSocket = (roomCode: string) => {
  const transport=useMemo(()=>{const active=activeCallSnapshot();return active?active.roomCode===roomCode.toUpperCase()?active.signalingSocket:isolatedRoomSocket(roomCode):socket;},[roomCode]);
  useEffect(() => {
    transport.auth = { roomCode };
    if(!transport.connected)connectRoomTransport(transport);
    return () => { if(activeCallSnapshot()?.roomCode!==roomCode.toUpperCase())disconnectRoomTransport(transport); };
  }, [roomCode,transport]);
  return transport;
};
