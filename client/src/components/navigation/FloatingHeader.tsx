import {Children,cloneElement,isValidElement,useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {useOptionalAccount} from '../../hooks/useAccount';
import {NavigationOverlay} from '../common/NavigationOverlay';
import {ChevronDown,Menu} from 'lucide-react';
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
 const profile=useOptionalAccount()?.profile;
 const items=Children.toArray(children);if(isValidElement<{to?:string;'aria-label'?:string}>(items[0])&&items[0].props['aria-label']==='NullChannel home')items[0]=cloneElement(items[0],{to:profile?'/dashboard':'/'});
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
 }}>{desktop?<>{items[0]}<ExperimentalMenuButton open={open} controls={id} onClick={()=>setOpen(value=>!value)}/><InfiniteNavigationPanel id={id} open={open} close={close}>{panelContent??items.slice(1)}</InfiniteNavigationPanel></>:className.includes('command-header--minimal')?<>{items[0]}<button className="nc-button" aria-label="Open navigation" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(true)}><Menu aria-hidden="true"/></button><NavigationOverlay id={id} title="Your navigation" open={open} close={close} desktopBreakpoint={768}>{panelContent??items.slice(1)}</NavigationOverlay></>:items}</header>;
}
export function HeaderOverflow({children,active=false}:{children:ReactNode;active?:boolean}) {
 const id=useId();
 return <details className="header-overflow" data-active={active} onClick={event=>{if((event.target as Element).closest('a'))event.currentTarget.open=false;}}>
  <summary aria-controls={id}>More<ChevronDown aria-hidden="true"/></summary>
  <nav id={id} aria-label="More account destinations" className="header-overflow__panel">{children}</nav>
 </details>;
}
