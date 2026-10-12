// @vitest-environment jsdom
import {act} from 'react';import {createRoot} from 'react-dom/client';import {expect,it,vi} from 'vitest';
const {socket,events,managerEvents}=vi.hoisted(()=>{const events=new Map<string,()=>void>(),managerEvents=new Map<string,()=>void>();const socket={connected:false,active:true,on:vi.fn((event:string,cb:()=>void)=>events.set(event,cb)),off:vi.fn((event:string)=>events.delete(event)),io:{on:vi.fn((event:string,cb:()=>void)=>managerEvents.set(event,cb)),off:vi.fn((event:string)=>managerEvents.delete(event))}};return{socket,events,managerEvents};});
vi.mock('../lib/socket',()=>({socket}));import {useConnectionStatus} from '../hooks/useConnectionStatus';
it('derives status from transport/manager events and releases every listener without making another socket',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div'),root=createRoot(host);function Fixture(){return <p>{useConnectionStatus()}</p>;}
 await act(async()=>root.render(<Fixture/>));expect(host.textContent).toBe('Reconnecting');socket.connected=true;await act(async()=>events.get('connect')!());expect(host.textContent).toBe('Connected');socket.connected=false;await act(async()=>events.get('disconnect')!());expect(host.textContent).toBe('Reconnecting');socket.active=false;await act(async()=>managerEvents.get('reconnect_failed')!());expect(host.textContent).toBe('Offline');await act(async()=>root.unmount());expect(events.size).toBe(0);expect(managerEvents.size).toBe(0);vi.unstubAllGlobals();
});
