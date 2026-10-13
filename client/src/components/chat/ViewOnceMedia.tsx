import {useEffect,useRef,useState} from 'react';
import {api} from '../../lib/api';
import {viewOnceUrl} from '../../lib/temporary-media';
import {Button} from '../common/Button';
import { API_URL } from '../../lib/constants';
/** No media request is issued before explicit consent to open. One response is kept only in memory. */
export function ViewOnceMedia({url,type,name,consumed,isSender=false}:{url:string;type:'image'|'voice'|'file';name?:string;consumed?:boolean;isSender?:boolean}){
 const [phase,setPhase]=useState<'ready'|'opening'|'open'|'closed'|'failed'>(consumed?'closed':'ready');const [objectUrl,setObjectUrl]=useState('');const current=useRef('');const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>{request.current?.abort();if(current.current)URL.revokeObjectURL(current.current);},[]);
 useEffect(()=>{if(consumed&&phase!=='open'){request.current?.abort();setPhase('closed');}},[consumed,phase]);
 async function open(){if(phase!=='ready'||request.current)return;setPhase('opening');const delivery=viewOnceUrl(url);if(!delivery){setPhase('failed');return;}const abort=new AbortController();request.current=abort;try{const response=await api.get(new URL(delivery,API_URL||window.location.origin).href,{responseType:'blob',signal:abort.signal});if(abort.signal.aborted)return;current.current=URL.createObjectURL(response.data);setObjectUrl(current.current);setPhase('open');}catch{if(!abort.signal.aborted)setPhase('failed');}}
 function close(){if(current.current)URL.revokeObjectURL(current.current);current.current='';setObjectUrl('');setPhase('closed');}
 return <section className="border border-cyan/40 p-3" aria-label="View-once attachment"><p className="mb-2 text-xs text-cyan">View-once media</p>{phase==='ready'&&<><p className="mb-3 text-sm text-muted">{isSender?'Preview your attachment. Recipient access permits one opening.':'Opening consumes this attachment’s server access. Screenshots or saved copies remain possible.'}</p><Button onClick={()=>void open()}>{isSender?'Preview attachment':'Open once'}</Button></>}{phase==='opening'&&<p role="status">Opening attachment…</p>}{phase==='open'&&<>{type==='image'?<img src={objectUrl} alt={name??'View-once image'} className="max-h-72 w-full object-contain"/>:type==='voice'?<audio controls src={objectUrl} className="w-full"/>:<a href={objectUrl} download={name??'attachment'} className="inline-flex min-h-11 items-center break-all text-cyan">Save {name??'attachment'}</a>}<Button className="mt-3" onClick={close}>Close attachment</Button></>}{phase==='closed'&&<p className="text-muted">This attachment is closed. Recipient access cannot be restored.</p>}{phase==='failed'&&<p role="alert" className="text-punch">Attachment unavailable. It may have expired or already been opened.</p>}</section>;
}
