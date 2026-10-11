// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AccountProvider, useAccount } from '../hooks/useAccount';
const {get,post,connect,disconnect,guestDisconnect} = vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),guestDisconnect:vi.fn()}));
vi.mock('../lib/account',()=>({accountApi:{get,post}}));
vi.mock('../lib/account-socket',()=>({accountSocket:{connect,disconnect,on:vi.fn(),off:vi.fn(),emit:vi.fn()}}));
vi.mock('../lib/socket',()=>({disconnectSocket:guestDisconnect}));
let root:Root;let container:HTMLDivElement;
function AccountView(){const {profile,logout}=useAccount();return <><p>{profile?.username??'Guest'}</p><button onClick={()=>void logout()}>Logout</button></>;}
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.clearAllMocks();localStorage.clear();container=document.createElement('div');document.body.append(container);root=createRoot(container);get.mockResolvedValue({data:{data:{profile:{username:'friend',display_name:'Friend'}}}});post.mockResolvedValue({data:{data:{logged_out:true}}});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('clears private account state and disconnects both sockets after server logout',async()=>{
  await act(async()=>root.render(<AccountProvider><AccountView/></AccountProvider>));expect(container.textContent).toContain('friend');
  await act(async()=>container.querySelector('button')!.click());
  expect(post).toHaveBeenCalledWith('/account/logout');expect(container.textContent).toContain('Guest');expect(disconnect).toHaveBeenCalled();expect(guestDisconnect).toHaveBeenCalledOnce();
  expect(localStorage.getItem('nullchannel_account_event')).toMatch(/^logout:\d+$/);
});
it('clears cached profile when another tab logs out without persisting account identifiers',async()=>{
  await act(async()=>root.render(<AccountProvider><AccountView/></AccountProvider>));
  await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:'nullchannel_account_event',newValue:'logout:123'})));
  expect(container.textContent).toContain('Guest');expect(guestDisconnect).toHaveBeenCalledOnce();
});
it('clears account state after an expired refresh session',async()=>{
  await act(async()=>root.render(<AccountProvider><AccountView/></AccountProvider>));
  await act(async()=>window.dispatchEvent(new Event('nullchannel-account-expired')));
  expect(container.textContent).toContain('Guest');expect(disconnect).toHaveBeenCalled();
});
it('does not restore a private profile from a response that arrives after cross-tab logout',async()=>{
  let resolve!:(value:unknown)=>void;get.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  await act(async()=>root.render(<AccountProvider><AccountView/></AccountProvider>));
  await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:'nullchannel_account_event',newValue:'logout:123'})));
  await act(async()=>resolve({data:{data:{profile:{username:'stale-private-account'}}}}));
  expect(container.textContent).toContain('Guest');expect(container.textContent).not.toContain('stale-private-account');
});
