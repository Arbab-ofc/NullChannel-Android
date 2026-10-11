import { API_URL } from './constants';
export function resolveMediaUrl(value:string,apiOrigin=API_URL){
  if(value.startsWith('/api/'))return `${apiOrigin}${value}`;
  return /^https?:\/\//i.test(value)?value:'';
}
export function viewOnceUrl(value:string,apiOrigin=API_URL){const resolved=resolveMediaUrl(value,apiOrigin);return resolved?`${resolved}${resolved.includes('?')?'&':'?'}open=1`:'';}
export function messageDeadline(message:{message_expires_at?:string|null;burn_expires_at?:string|null}){
 const deadlines=[message.message_expires_at,message.burn_expires_at].filter((value):value is string=>!!value).map(Date.parse).filter(Number.isFinite);
 return deadlines.length?Math.min(...deadlines):null;
}
