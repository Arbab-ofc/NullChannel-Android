import {Children,useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import '../../styles/desktop-header.css';
import '../../styles/infinite-navigation.css';
import {ExperimentalMenuButton} from './ExperimentalMenuButton';
import {InfiniteNavigationPanel} from './InfiniteNavigationPanel';

/** Desktop-only dismissal; the original small-screen controls keep their behavior. */
export function FloatingHeader({children,className='',panelContent}:{children:ReactNode;className?:string;panelContent?:ReactNode}) {
 const ref=useRef<HTMLElement>(null);
 const [desktop,setDesktop]=useState(()=>window.innerWidth>=768);
 const [open,setOpen]=useState(false);const id=useId();const close=useCallback(()=>setOpen(false),[]);
 useEffect(()=>{const update=()=>{setDesktop(window.innerWidth>=768);if(window.innerWidth<768)setOpen(false);};window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);},[]);
 const items=Children.toArray(children);
 useEffect(()=>{
  const outside=(event:Event)=>{
   if(window.innerWidth<768)return;
   ref.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(details=>{if(!details.contains(event.target as Node))details.open=false;});
  };
  const resize=()=>{if(window.innerWidth<1024)ref.current?.querySelectorAll<HTMLDetailsElement>('.header-overflow[open]').forEach(details=>{details.open=false;});};
  document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);window.addEventListener('resize',resize);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);window.removeEventListener('resize',resize);};
 },[]);
 return <header ref={ref} className={`command-header ${className}`} onKeyDown={event=>{
  if(window.innerWidth<768||event.key!=='Escape')return;
  const details=(event.target as Element).closest<HTMLDetailsElement>('details[open]');
  if(details&&ref.current?.contains(details)){event.preventDefault();event.stopPropagation();details.open=false;details.querySelector('summary')?.focus({preventScroll:true});}
 }}>{desktop?<>{items[0]}<ExperimentalMenuButton open={open} controls={id} onClick={()=>setOpen(value=>!value)}/><InfiniteNavigationPanel id={id} open={open} close={close}>{panelContent??items.slice(1)}</InfiniteNavigationPanel></>:children}</header>;
}
export function HeaderOverflow({children,active=false}:{children:ReactNode;active?:boolean}) {
 const id=useId();
 return <details className="header-overflow" data-active={active} onClick={event=>{if((event.target as Element).closest('a'))event.currentTarget.open=false;}}>
  <summary aria-controls={id}>More<ChevronDown aria-hidden="true"/></summary>
  <nav id={id} aria-label="More account destinations" className="header-overflow__panel">{children}</nav>
 </details>;
}
