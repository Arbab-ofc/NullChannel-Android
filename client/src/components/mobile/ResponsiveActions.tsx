import {useEffect,useState,type ReactNode} from 'react';
import {Modal} from '../common/Modal';
export function ResponsiveActions({children,close,className}:{children:ReactNode;close:()=>void;className:string}) {
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 640px)').matches);
 useEffect(()=>{const query=window.matchMedia('(max-width: 640px)');const changed=()=>setMobile(query.matches);query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);},[]);
 return mobile?<Modal sheet titleId="message-actions-heading" close={close}><h2 id="message-actions-heading">Message actions</h2><div className="sheet-actions">{children}</div></Modal>:<div className={className}>{children}</div>;
}
