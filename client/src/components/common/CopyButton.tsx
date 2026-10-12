import {useEffect,useRef,useState} from 'react';
import {Check,Copy} from 'lucide-react';
import {Button} from './Button';
export function CopyButton({value,label='Copy',onCopied,onError,perform}:{value:string;label?:string;onCopied?:()=>void;onError?:(message:string)=>void;perform?:(value:string)=>Promise<boolean>}){
 const [state,setState]=useState<'idle'|'pending'|'copied'|'failed'>('idle');const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const live=useRef(true);const busy=useRef(false);const generation=useRef(0);
 useEffect(()=>{live.current=true;return()=>{live.current=false;clearTimeout(timer.current);};},[]);
 useEffect(()=>{generation.current++;clearTimeout(timer.current);setState(busy.current?'pending':'idle');},[value]);
 async function copy(){if(busy.current)return;busy.current=true;const attempt=generation.current;setState('pending');try{if(perform){if(!await perform(value))throw new Error('Copy failed');}else await navigator.clipboard.writeText(value);if(!live.current||attempt!==generation.current)return;setState('copied');onCopied?.();timer.current=setTimeout(()=>setState('idle'),2000);}catch{if(!live.current||attempt!==generation.current)return;setState('failed');onError?.('Copy failed. Select the text to copy it manually.');}finally{busy.current=false;if(live.current&&attempt!==generation.current)setState('idle');}}
 return <span className="copy-control"><Button disabled={state==='pending'} onClick={()=>void copy()} aria-label={label}><span className="copy-control__icon" key={state}>{state==='copied'?<Check aria-hidden="true"/>:<Copy aria-hidden="true"/>}</span>{state==='copied'?'Copied':label}</Button><span className="sr-only" role="status">{state==='copied'?'Copied to clipboard.':state==='failed'?'Copy failed. Select the text to copy it manually.':''}</span></span>;
}
