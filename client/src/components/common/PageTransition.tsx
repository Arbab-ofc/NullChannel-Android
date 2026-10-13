import {useEffect,useLayoutEffect,useRef,type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {isAndroidApp,scrollAndroidToLocation} from '../../lib/android-navigation';
export function PageTransition({children}:{children:ReactNode}) {
 const {pathname,hash}=useLocation();const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  if(!isAndroidApp())return;
  scrollAndroidToLocation(pathname,hash);
 },[pathname,hash]);
 useEffect(()=>{
  if(/^\/(chat\/|login|signup|forgot-password|reset-password)/.test(pathname))return;
  let done=false;
  const focus=()=>{const heading=ref.current?.querySelector<HTMLElement>('h1');if(!done&&heading&&!document.querySelector('dialog[open]')){done=true;heading.tabIndex=-1;heading.focus({preventScroll:true});}};
  focus();const observer=new MutationObserver(focus);if(ref.current)observer.observe(ref.current,{childList:true,subtree:true});return()=>observer.disconnect();
 },[pathname]);
 return <div ref={ref} className={pathname.startsWith('/chat/')?'route-chat':'route-transition'}>{children}</div>;
}
