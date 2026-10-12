import { useRef, useState, type ReactNode } from 'react';
import { Reply } from 'lucide-react';
export const REPLY_THRESHOLD = 64;
export function replyIntent(dx:number,dy:number) { return dx >= REPLY_THRESHOLD && Math.abs(dx) > Math.abs(dy)*1.5; }
export function SwipeableMessage({children,enabled,onReply}:{children:ReactNode;enabled:boolean;onReply:()=>void}) {
  const start = useRef<{x:number;y:number;id:number}|null>(null);
  const [offset,setOffset] = useState(0);
  const cancel = () => { start.current=null;setOffset(0); };
  return <div className="swipe-message" onPointerDown={event=>{
    if (!enabled || event.pointerType !== 'touch' || !event.isPrimary || event.clientX < 24 || event.clientX > innerWidth-24 || document.querySelector('dialog[open]') || (event.target as Element).closest('button,a,input,textarea,audio,video,[role="button"]')) return;
    start.current={x:event.clientX,y:event.clientY,id:event.pointerId};
  }} onPointerMove={event=>{
    const origin=start.current;if(!origin || origin.id!==event.pointerId)return;
    const dx=event.clientX-origin.x,dy=event.clientY-origin.y;
    if (Math.abs(dy)>12 && Math.abs(dy)>Math.abs(dx)) {cancel();return;}
    if(dx>12 && dx>Math.abs(dy)*1.5){event.currentTarget.setPointerCapture(event.pointerId);setOffset(Math.min(84,dx*.75));}
  }} onPointerUp={event=>{const origin=start.current;if(origin && origin.id===event.pointerId && enabled && !document.querySelector('dialog[open]') && replyIntent(event.clientX-origin.x,event.clientY-origin.y))onReply();cancel();}} onPointerCancel={cancel} onLostPointerCapture={cancel}>
    <span className="swipe-reply-icon" style={{opacity:Math.min(1,offset/48),transform:`scale(${.7+offset/280})`}} aria-hidden="true"><Reply/></span>
    <div className="swipe-message-content" style={{transform:`translateX(${offset}px)`,transition:start.current?'none':undefined}}>{children}</div>
  </div>;
}
