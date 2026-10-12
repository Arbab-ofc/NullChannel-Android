import {useEffect,useRef,useState,type ReactNode} from 'react';
import {RefreshCw} from 'lucide-react';
export const REFRESH_THRESHOLD=72;
export function refreshIntent(dx:number,dy:number){return dy>=REFRESH_THRESHOLD&&dy>Math.abs(dx)*1.5;}
/** Native edge/back and iOS refresh gestures retain priority. No polling. */
export function PullToRefresh({children,refresh}:{children:ReactNode;refresh:()=>Promise<unknown>}) {
 const ref=useRef<HTMLDivElement>(null),pending=useRef(false);const [distance,setDistance]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const trigger=useRef<()=>Promise<void>>(async()=>undefined);
 const latest=useRef(refresh);latest.current=refresh;
 useEffect(()=>{
  const node=ref.current!;let start:{x:number;y:number}|null=null;let dx=0,dy=0;let live=true;
  const run=async()=>{if(pending.current)return;pending.current=true;setLoading(true);setError('');try{await latest.current();}catch{if(live)setError('Refresh failed. Try again.');}finally{pending.current=false;if(live)setLoading(false);}};
  trigger.current=run;
  const begin=(event:TouchEvent)=>{
   if(event.touches.length!==1||pending.current||window.scrollY>0||document.querySelector('dialog[open]')||/iPad|iPhone|iPod/.test(navigator.userAgent))return;
   const touch=event.touches[0],target=event.target as Element;
   if(touch.clientX<24||touch.clientX>innerWidth-24||target.closest('button,a,input,textarea,select,audio,video'))return;
   for(let parent=target.parentElement;parent&&parent!==node;parent=parent.parentElement)if(parent.scrollHeight>parent.clientHeight&&/auto|scroll/.test(getComputedStyle(parent).overflowY))return;
   start={x:touch.clientX,y:touch.clientY};dx=dy=0;
  };
  const move=(event:TouchEvent)=>{if(!start)return;if(event.touches.length!==1){start=null;setDistance(0);return;}dx=event.touches[0].clientX-start.x;dy=event.touches[0].clientY-start.y;if(Math.abs(dx)>12&&Math.abs(dx)>dy){start=null;setDistance(0);return;}if(dy>12&&dy>Math.abs(dx)*1.5&&event.cancelable){event.preventDefault();setDistance(Math.min(92,dy));}};
  const end=()=>{if(start&&refreshIntent(dx,dy))void run();start=null;setDistance(0);};
  const cancel=()=>{start=null;setDistance(0);};
  node.addEventListener('touchstart',begin,{passive:true});node.addEventListener('touchmove',move,{passive:false});node.addEventListener('touchend',end);node.addEventListener('touchcancel',cancel);
  return()=>{live=false;node.removeEventListener('touchstart',begin);node.removeEventListener('touchmove',move);node.removeEventListener('touchend',end);node.removeEventListener('touchcancel',cancel);};
 },[]);
 return <div ref={ref} className="refresh-list"><div className="refresh-indicator" style={{height:loading?40:distance*.4}} role="status">{(loading||distance>12)&&<RefreshCw aria-label={loading?'Refreshing':distance>=REFRESH_THRESHOLD?'Release to refresh':'Pull to refresh'} className={loading?'loading-spin':''}/>}</div><button type="button" className="list-refresh-button" disabled={loading} onClick={()=>void trigger.current()} aria-label="Refresh list"><RefreshCw aria-hidden="true"/>Refresh</button>{error&&<p role="alert">{error}</p>}{children}</div>;
}
