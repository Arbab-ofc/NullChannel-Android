import { useEffect,useState } from 'react';
import { socket } from '../lib/socket';
export function useConnectionStatus() {
  const derive = () => socket.connected ? 'Connected' : socket.active ? 'Reconnecting' : 'Offline';
  const [status,setStatus]=useState(derive);
  useEffect(()=>{
    const update=()=>setStatus(derive());
    const failed=(error:Error)=>{setStatus(error.message==='JOIN_REQUIRED'?'Join required':error.message==='SESSION_EXPIRED'?'Session expired':derive());};
    socket.on('connect',update); socket.on('disconnect',update); socket.on('connect_error',failed);
    socket.io.on('reconnect_attempt',update); socket.io.on('reconnect_failed',update);update();
    return ()=>{socket.off('connect',update);socket.off('disconnect',update);socket.off('connect_error',failed);socket.io.off('reconnect_attempt',update);socket.io.off('reconnect_failed',update);};
  },[]);
  return status;
}
