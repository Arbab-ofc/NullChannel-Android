import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
/** Native top layer handles focus trapping; closing restores the invoking control. */
export function Modal({titleId,close,children}:{titleId:string;close:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const origin=document.activeElement as HTMLElement|null;const dialog=ref.current!;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();return()=>{dialog.close();document.body.style.overflow=overflow;if(origin?.isConnected)origin.focus({preventScroll:true});};},[]);
 return createPortal(<dialog ref={ref} aria-labelledby={titleId} className="nc-modal" onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>{children}</dialog>,document.body);
}
