import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {X} from 'lucide-react';
import {createPortal} from 'react-dom';
import {Modal} from '../common/Modal';
export function placeMessageActions(anchor:DOMRect,menu:{width:number;height:number},viewport:{width:number;top:number;bottom:number}){
 const margin=12,gap=8;const left=Math.max(margin,Math.min(anchor.right-menu.width,viewport.width-menu.width-margin));
 if(anchor.top-gap-menu.height>=viewport.top+margin)return {left,top:anchor.top-gap-menu.height};
 if(anchor.bottom+gap+menu.height<=viewport.bottom-margin)return {left,top:anchor.bottom+gap};
 if(anchor.left-gap-menu.width>=margin)return {left:anchor.left-gap-menu.width,top:Math.max(viewport.top+margin,Math.min(anchor.top,viewport.bottom-menu.height-margin))};
 if(anchor.right+gap+menu.width<=viewport.width-margin)return {left:anchor.right+gap,top:Math.max(viewport.top+margin,Math.min(anchor.top,viewport.bottom-menu.height-margin))};
 return null;
}
export function ResponsiveActions({children,close,className,anchor}:{children:ReactNode;close:()=>void;className:string;anchor?:HTMLElement|null}) {
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 640px)').matches);
 const [position,setPosition]=useState<{left:number;top:number}|null>(null);const [sheet,setSheet]=useState(false);const menu=useRef<HTMLDivElement>(null);const focused=useRef(false);
 useEffect(()=>{const query=window.matchMedia('(max-width: 640px)');const changed=()=>setMobile(query.matches);query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);},[]);
 useLayoutEffect(()=>{
  if(mobile||sheet||!anchor||!menu.current)return;
  const origin=document.activeElement as HTMLElement|null;const element=menu.current;
  const update=()=>{const element=menu.current;if(!element)return;const viewport=window.visualViewport;const top=viewport?.offsetTop??0;const bottom=Math.min(top+(viewport?.height??innerHeight),document.querySelector('.chat-composer')?.getBoundingClientRect().top??innerHeight);const next=placeMessageActions(anchor.getBoundingClientRect(),element.getBoundingClientRect(),{width:innerWidth,top,bottom});setPosition(next);if(!next)setSheet(true);};
  update();
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();close();}};document.addEventListener('keydown',escape);
  const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!anchor.contains(event.target as Node))close();};
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):null;observer?.observe(anchor);observer?.observe(menu.current);
  window.addEventListener('scroll',update,{capture:true,passive:true});window.addEventListener('resize',update);document.addEventListener('pointerdown',outside);
  return()=>{observer?.disconnect();window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);if(origin?.isConnected&&(!document.activeElement||document.activeElement===document.body||element.contains(document.activeElement)))origin.focus({preventScroll:true});};
 },[mobile,sheet,anchor,close]);
 useLayoutEffect(()=>{if(position&&menu.current&&!focused.current){focused.current=true;menu.current.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});}},[position]);
 if(mobile||sheet)return <Modal sheet titleId="message-actions-heading" close={close}><section className="message-action-sheet"><header><h2 id="message-actions-heading">Message actions</h2><button type="button" aria-label="Close message actions" onClick={close}><X aria-hidden="true"/></button></header><div className="sheet-actions">{children}</div></section></Modal>;
 return createPortal(<div ref={menu} role="group" aria-label="Message actions" className={className} style={{position:'fixed',left:position?.left??0,top:position?.top??0,right:'auto',bottom:'auto',visibility:anchor&&!position?'hidden':undefined,zIndex:70}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close();}else if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const controls=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const index=controls.indexOf(document.activeElement as HTMLButtonElement);controls[(index+(event.key==='ArrowDown'?1:-1)+controls.length)%controls.length]?.focus();}}}>{children}</div>,document.body);
}
