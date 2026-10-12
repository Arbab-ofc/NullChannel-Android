import {Children,Fragment,isValidElement,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {ExperimentalMenuButton} from './ExperimentalMenuButton';

const flatten=(nodes:ReactNode):ReactNode[]=>Children.toArray(nodes).flatMap(node=>isValidElement<{children?:ReactNode}>(node)&&node.type===Fragment?flatten(node.props.children):[node]);
/** Finite five-sequence visual loop; only the middle sequence contains controls. */
export function InfiniteNavigationPanel({id,open,close,children}:{id:string;open:boolean;close:()=>void;children:ReactNode}) {
 const content=flatten(children);const lists=content.filter(node=>isValidElement(node)&&node.type==='nav');const actions=content.filter(node=>!isValidElement(node)||node.type!=='nav');
 const dialog=useRef<HTMLDialogElement>(null),scroller=useRef<HTMLDivElement>(null),canonical=useRef<HTMLDivElement>(null),before=useRef<HTMLDivElement>(null),after=useRef<HTMLDivElement>(null);
 const [keyboard,setKeyboard]=useState(false);const [shortMenu,setShortMenu]=useState(false);
 const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 const loop=!keyboard&&!reduced&&!shortMenu;
 const height=useRef(0);const pointerStart=useRef<{x:number;y:number}|null>(null);
 const restore=useRef<(()=>void)|null>(null);const unlock=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  const element=dialog.current!;let timer:ReturnType<typeof setTimeout>|undefined;
  if(open){
   setKeyboard(false);
   if(!element.open){
    const origin=document.activeElement as HTMLElement|null;const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    unlock.current=()=>{document.body.style.overflow=previous;unlock.current=null;};
    restore.current=()=>{unlock.current?.();if(origin?.isConnected)origin.focus({preventScroll:true});restore.current=null;};
    element.showModal();element.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});
   }
  }else if(element.open){timer=setTimeout(()=>{element.close();restore.current?.();},reduced?0:520);}
  const resize=()=>{if(open&&innerWidth<768)close();};window.addEventListener('resize',resize);
  return()=>{clearTimeout(timer);window.removeEventListener('resize',resize);};
 },[open,close,reduced]);
 useEffect(()=>{const element=dialog.current!;return()=>{if(element.open)element.close();restore.current?.();};},[]);
 useLayoutEffect(()=>{
  if(!open||!scroller.current||!canonical.current)return;
  const viewport=scroller.current,source=canonical.current;
  if(!shortMenu&&source.querySelectorAll('a[href],button').length<3){setShortMenu(true);return;}
  const update=()=>{
   height.current=source.offsetHeight;
   if(loop){
    for(const destination of [before.current,after.current]){
     if(!destination)continue;
     const copy=source.cloneNode(true) as HTMLElement;
     copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));
     // Visual-only text: never links, inputs, buttons or duplicate accessible controls.
     copy.querySelectorAll('a,button,input,select,textarea,summary').forEach(control=>{
      const label=document.createElement('span');label.className=control.className;if(control.hasAttribute('aria-current'))label.dataset.current='true';label.append(...control.childNodes);control.replaceWith(label);
     });
     destination.replaceChildren(copy,copy.cloneNode(true));destination.style.height=`${height.current*2}px`;destination.style.overflow='hidden';
    }
    viewport.scrollTop=height.current*2;
   }else viewport.scrollTop=0;
  };
  update();const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):null;observer?.observe(source);
  let frame=0;
  const normalize=()=>{
   if(!loop||frame)return;
   frame=requestAnimationFrame(()=>{frame=0;const h=height.current;if(h<=0)return;const y=viewport.scrollTop;if(y<h*2||y>=h*3)viewport.scrollTop=h*2+((y-h*2)%h+h)%h;});
  };
  viewport.addEventListener('scroll',normalize,{passive:true});
  return()=>{observer?.disconnect();cancelAnimationFrame(frame);viewport.removeEventListener('scroll',normalize);};
 },[open,loop,children,shortMenu]);
 return createPortal(<dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} className={`infinite-navigation ${open?'is-open':''}`} onKeyDown={event=>{
  if(event.key!=='Tab')return;
  const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],summary,input:not(:disabled)')].filter(x=>!x.closest('[inert]')&&x.getClientRects().length>0&&getComputedStyle(x).visibility!=='hidden');
  const first=controls[0],last=controls.at(-1);if(!first||!last){event.preventDefault();return;}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus({preventScroll:true});}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus({preventScroll:true});}
 }} onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
  <section className="infinite-navigation__surface">
   <header><div><p className="nc-eyebrow">NULLCHANNEL / NAVIGATION</p><h2 id={`${id}-title`}>Find your space.</h2></div><ExperimentalMenuButton open={open} controls={id} onClick={close}/></header>
   <p className="infinite-navigation__hint">Scroll to explore. Use Tab for standard navigation.</p>
   <div ref={scroller} className="infinite-navigation__scroll" onPointerDown={event=>{pointerStart.current={x:event.clientX,y:event.clientY};}} onPointerCancel={()=>{pointerStart.current=null;}} onPointerUp={event=>{
    const start=pointerStart.current;pointerStart.current=null;
    if(!loop||!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>8||event.target!==event.currentTarget||!canonical.current||height.current<=0)return;
    // Inert copies retarget pointer events to the scroll surface. Resolve a tap
    // to its sole canonical control without introducing duplicate links.
    const source=canonical.current,rect=source.getBoundingClientRect();
    const localY=((event.clientY-rect.top)%height.current+height.current)%height.current;
    const control=[...source.querySelectorAll<HTMLElement>('a[href],button,summary')].find(item=>{const r=item.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&localY>=r.top-rect.top&&localY<=r.bottom-rect.top;});
    control?.click();
   }} onKeyDown={event=>{if(event.key==='Tab')setKeyboard(true);}} onFocusCapture={event=>{if((event.target as Element).closest('a,button,input,summary'))setKeyboard(true);}}>
    {loop&&<div key="before" ref={before} aria-hidden="true" inert className="infinite-navigation__clone"/>}
    <div key="canonical" ref={canonical} className="infinite-navigation__sequence" onClickCapture={event=>{const target=event.target as Element;if(target.closest('a,button')&&!target.closest('.theme-picker'))unlock.current?.();}} onClick={event=>{if((event.target as Element).closest('a,button:not(.theme-picker button)'))close();}}>{lists}</div>
    {loop&&<div key="after" ref={after} aria-hidden="true" inert className="infinite-navigation__clone"/>}
   </div>
   <div className="infinite-navigation__footer" onClickCapture={event=>{const target=event.target as Element;if(target.closest('a,button')&&!target.closest('.theme-picker'))unlock.current?.();}} onClick={event=>{const target=event.target as Element;if(target.closest('a,button')&&!target.closest('.theme-picker'))close();}}>{actions}</div>
  </section>
 </dialog>,document.body);
}
