import { useCallback,useEffect,useState } from 'react';
import { socket } from '../lib/socket';
export function useConnectionStatus(transport=socket) {
  const derive=useCallback(()=>transport.connected?'Connected':transport.active?'Reconnecting':'Offline',[transport]);
  const [status,setStatus]=useState(derive);
  useEffect(()=>{
    const update=()=>setStatus(derive());
    const failed=(error:Error)=>{setStatus(error.message==='JOIN_REQUIRED'?'Join required':error.message==='SESSION_EXPIRED'?'Session expired':derive());};
    transport.on('connect',update); transport.on('disconnect',update); transport.on('connect_error',failed);
    transport.io.on('reconnect_attempt',update); transport.io.on('reconnect_failed',update);update();
    return ()=>{transport.off('connect',update);transport.off('disconnect',update);transport.off('connect_error',failed);transport.io.off('reconnect_attempt',update);transport.io.off('reconnect_failed',update);};
  },[transport,derive]);
  return status;
}
