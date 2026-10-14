import { api } from './api';
import { iceConfiguration } from './webrtc';
export type IceLease={config:RTCConfiguration;expiresAt:number;relay:boolean};
export async function fetchIceLease(roomCode:string,signal?:AbortSignal):Promise<IceLease>{
 const fallback={config:iceConfiguration(),expiresAt:Date.now()+30_000,relay:false};
 try{
  const response=await api.get(`/rooms/${roomCode}/calls/ice-servers`,{timeout:5000,signal});
  const body=response.data?.data;
  if(!Array.isArray(body?.iceServers)||!Number.isFinite(body.expiresAt))throw new Error('Voice relay configuration is invalid.');
  return {config:iceConfiguration(undefined,body.iceServers),expiresAt:body.expiresAt*1000,relay:body.iceServers.length>0};
 }catch(error){
  if(signal?.aborted)throw new DOMException('Call cancelled.','AbortError');
  const status=(error as {response?:{status?:number}})?.response?.status;
  if(status===404||status===undefined&&!(error instanceof Error&&error.message.includes('configuration')))return fallback;
  throw new Error('Secure voice relay settings could not be loaded. Please retry.');
 }
}
