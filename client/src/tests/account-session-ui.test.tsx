// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {MemoryRouter,Link,useLocation} from 'react-router-dom';
import {FloatingHeader} from '../components/navigation/FloatingHeader';
import {ThemeProvider} from '../hooks/useTheme';
import {ThemeToggle} from '../components/common/ThemeToggle';
import { AccountProvider, useAccount } from '../hooks/useAccount';
const {get,post,connect,disconnect,guestDisconnect} = vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),guestDisconnect:vi.fn()}));
vi.mock('../lib/account',()=>({accountApi:{get,post},accountError:()=> 'Temporary verification error'}));
vi.mock('../lib/account-socket',()=>({accountSocket:{connect,disconnect,on:vi.fn(),off:vi.fn(),emit:vi.fn()}}));
vi.mock('../lib/socket',()=>({disconnectSocket:guestDisconnect}));
let root:Root;let container:HTMLDivElement;
function AccountView(){const {profile,logout,refresh}=useAccount();return <><p>{profile?.username??'Guest'}</p><button onClick={()=>void logout()}>Logout</button><button onClick={()=>void refresh()}>Refresh</button></>;}
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

it.each([undefined,403,429,500,502,503])('preserves validated profile after temporary/authorization failure %s',async status=>{
 await act(async()=>root.render(<AccountProvider><AccountView/></AccountProvider>));get.mockRejectedValueOnce({isAxiosError:true,response:status?{status}:undefined});await act(async()=>container.querySelectorAll('button')[1].click());expect(container.textContent).toContain('friend');expect(guestDisconnect).not.toHaveBeenCalled();
});
it('does not reset account state on unrelated tab storage activity',async()=>{await act(async()=>root.render(<AccountProvider><AccountView/></AccountProvider>));await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:'nullchannel_theme',newValue:'oled'})));expect(container.textContent).toContain('friend');expect(guestDisconnect).not.toHaveBeenCalled();});

function NavigationFixture(){const location=useLocation();return <><FloatingHeader><Link to="/" aria-label="NullChannel home">NullChannel</Link></FloatingHeader><ThemeToggle/><AccountView/><p data-route>{location.pathname}</p></>;}
it('preserves account after ten brand clicks, OLED selection and normal route navigation',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));await act(async()=>root.render(<AccountProvider><ThemeProvider><MemoryRouter initialEntries={['/friends']}><NavigationFixture/></MemoryRouter></ThemeProvider></AccountProvider>));
 for(let i=0;i<10;i++)await act(async()=>container.querySelector<HTMLAnchorElement>('a[aria-label="NullChannel home"]')!.click());expect(container.querySelector('[data-route]')?.textContent).toBe('/dashboard');
 await act(async()=>container.querySelector<HTMLInputElement>('input[value="oled"]')!.click());expect(container.textContent).toContain('friend');expect(post).not.toHaveBeenCalled();expect(guestDisconnect).not.toHaveBeenCalled();expect(get).toHaveBeenCalledTimes(1);expect(localStorage.getItem('nullchannel_theme')).toBe('oled');
});

it('does not disconnect an unrelated guest socket during initial account validation failure',async()=>{get.mockRejectedValueOnce({isAxiosError:true,response:{status:401}});await act(async()=>root.render(<AccountProvider><AccountView/></AccountProvider>));await act(async()=>window.dispatchEvent(new Event('nullchannel-account-expired')));expect(guestDisconnect).not.toHaveBeenCalled();expect(container.textContent).toContain('Guest');});
