import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {accountApi,accountError} from '../../lib/account';
import {accountSocket} from '../../lib/account-socket';
import {Button} from '../common/Button';
type Eligibility={state:'available'|'pending'|'active'|'cooldown';code?:string;expires_at?:string;retry_at?:string};
export function cooldownLabel(deadline:string,now:number){const seconds=Math.max(0,Math.ceil((Date.parse(deadline)-now)/1000));return Number.isFinite(seconds)?`Try again in ${Math.floor(seconds/60)}m ${seconds%60}s`:'Checking invitation eligibility';}
export function TemporaryChatButton({username}:{username:string}){
 const [state,setState]=useState<Eligibility|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[now,setNow]=useState(Date.now());const pending=useRef(false),generation=useRef(0);
 const load=useCallback(async()=>{if(pending.current)return;pending.current=true;const version=++generation.current;try{const response=await accountApi.get(`/registered/invitations/eligibility/${encodeURIComponent(username)}`);if(version===generation.current){setState(response.data.data);setError('');}}catch(e){if(version===generation.current)setError(accountError(e));}finally{if(version===generation.current)pending.current=false;}},[username]);
 useEffect(()=>{void load();const events=['connect','rooms:updated','invitation:received'];events.forEach(e=>accountSocket.on(e,load));const invalidate=()=>{generation.current++;pending.current=false;};return()=>{invalidate();events.forEach(e=>accountSocket.off(e,load));};},[load]);
 useEffect(()=>{if(state?.state!=='cooldown'||!state.retry_at)return;setNow(Date.now());const interval=setInterval(()=>setNow(Date.now()),1000);const deadline=setTimeout(()=>void load(),Math.max(0,Date.parse(state.retry_at)-Date.now())+50);return()=>{clearInterval(interval);clearTimeout(deadline);};},[state,load]);
 useEffect(()=>{if(!state||!['active','pending'].includes(state.state)||!state.expires_at)return;const timer=setTimeout(()=>void load(),Math.max(0,Date.parse(state.expires_at)-Date.now())+50);return()=>clearTimeout(timer);},[state,load]);
 async function send(){if(busy||state?.state!=='available')return;setBusy(true);setError('');try{await accountApi.post('/registered/invitations',{username});setState({state:'pending'});}catch(e){setError(accountError(e));await load();}finally{setBusy(false);}}
 return <div className="space-y-2">{state?.state==='active'&&state.code?<Link className="nc-button" to={`/chat/${state.code}`}>Continue Temporary Chat</Link>:<Button disabled={busy||state?.state!=='available'} onClick={()=>void send()}>{state?.state==='pending'?'Invitation already pending':state?.state==='cooldown'&&state.retry_at?cooldownLabel(state.retry_at,now):busy?'Sending invitation...':state?'Start Temporary Chat':'Checking eligibility...'}</Button>}{error&&<div role="alert"><p>{error}</p><Button onClick={()=>void load()}>Retry eligibility</Button></div>}</div>;
}
