import { supabase } from '../config/supabase.js';
import { emitAccountEvent } from './presence.service.js';
const lastStatus=new Map<string,{value:string,until:number}>();
/** Service-only IDs select account socket channels; no UUID enters emitted payloads. */
export async function publishMatchStatuses(extra:string[]=[]){
 const [queued,reserved]=await Promise.all([supabase.from('nc_match_queue').select('account_id'),supabase.from('nc_match_reservations').select('account_id')]);
 if(queued.error)throw queued.error;if(reserved.error)throw reserved.error;
 const now=Date.now();for(const [id,value]of lastStatus){if(value.until<now)lastStatus.delete(id);}
 const accounts=new Set([...extra,...lastStatus.keys(),...(queued.data??[]).map(r=>r.account_id),...(reserved.data??[]).map(r=>r.account_id)]);
 for(const account of accounts){const {data,error}=await supabase.rpc('nc_match_status',{p_account:account});if(error)throw error;const value=JSON.stringify(data);if(lastStatus.get(account)?.value!==value)emitAccountEvent(account,'match:status',data);if(data?.state==='searching'||data?.state==='proposal')lastStatus.set(account,{value,until:now+90000});else lastStatus.delete(account);}
}
