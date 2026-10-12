import {useEffect,useRef,type CSSProperties,type ReactNode} from 'react';
import {useVisibleViewport} from '../../hooks/useVisibleViewport';
import {createPortal} from 'react-dom';
/** Native top layer handles focus trapping; closing restores the invoking control. */
export function Modal({titleId,close,children,sheet=false}:{titleId:string;close:()=>void;children:ReactNode;sheet?:boolean}){
 const viewport=useVisibleViewport();
 const start=useRef<number|null>(null);
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const origin=document.activeElement as HTMLElement|null;const dialog=ref.current!;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();return()=>{dialog.close();document.body.style.overflow=overflow;if(origin?.isConnected)origin.focus({preventScroll:true});};},[]);
 return createPortal(<dialog ref={ref} aria-labelledby={titleId} style={{maxHeight:viewport.height,'--sheet-bottom':viewport.height?`${Math.max(0,window.innerHeight-parseFloat(String(viewport.height))-parseFloat(String(viewport.top??0)))}px`:undefined} as CSSProperties} className={`nc-modal ${sheet?'nc-modal--sheet':''}`} onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>{sheet&&<button type="button" className="sheet-handle" aria-label="Close panel" onClick={close} onPointerDown={event=>{start.current=event.clientY;event.currentTarget.setPointerCapture(event.pointerId);}} onPointerUp={event=>{if(start.current!==null&&event.clientY-start.current>64)close();start.current=null;}} onPointerCancel={()=>{start.current=null;}}><span/></button>}{children}</dialog>,document.body);
}
