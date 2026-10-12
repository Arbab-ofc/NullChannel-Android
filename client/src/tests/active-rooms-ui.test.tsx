// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActiveRoomsSection, type ActiveRoom } from '../components/rooms/ActiveRoomsSection';
import { ThemeProvider } from '../hooks/useTheme';
import LandingPage from '../pages/LandingPage';
const {get}=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../lib/api',()=>({api:{get,post:vi.fn()}}));
vi.mock('../hooks/useLocalSender',()=>({useLocalSender:()=> 'local-room-fixture'}));
let host:HTMLDivElement,root:Root;
const privateRoom:ActiveRoom={code:'PRIVATE1',room_name:'Late night catch-up',room_type:'private',expires_at:'2026-10-13T00:00:00Z'};
const groupRoom:ActiveRoom={...privateRoom,code:'GROUP001',room_name:'The study circle',room_type:'group'};
const props=()=>({rooms:[] as ActiveRoom[],loading:false,error:'',refresh:vi.fn(async()=>undefined),openRoom:vi.fn(),createRoom:vi.fn()});
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));host=document.createElement('div');document.body.append(host);root=createRoot(host);get.mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();localStorage.clear();});
it('uses semantic workspace/category headings and hides counts and stale entries during loading',async()=>{
 await act(async()=>root.render(<ActiveRoomsSection {...props()} rooms={[privateRoom]} loading/>));
 expect(host.querySelector('h2')?.textContent).toBe('Your Spaces');expect(host.textContent).toContain('YOUR WORKSPACE');expect(host.querySelectorAll('h3').length).toBe(2);expect(host.querySelectorAll('.skeleton-layout').length).toBe(2);expect(host.querySelector('.space-category__count')).toBeNull();expect(host.querySelector('.space-room')).toBeNull();expect(host.textContent).not.toContain('No rooms yet');
});
it('shows successful empty states with real zero counts and reuses each room creation action',async()=>{
 const options=props();await act(async()=>root.render(<ActiveRoomsSection {...options}/>));expect(host.querySelectorAll('.nc-empty').length).toBe(2);expect(host.textContent).toContain('Create a space and start a conversation.');expect([...host.querySelectorAll('.space-category__count')].map(node=>node.textContent)).toEqual(['0','0']);
 await act(async()=>{host.querySelector<HTMLButtonElement>('.space-category--private .space-create')!.click();host.querySelector<HTMLButtonElement>('.space-category--group .space-create')!.click();});expect(options.createRoom.mock.calls).toEqual([['private'],['group']]);
});
it('announces a failed request without empty states, room counts or stale entries',async()=>{
 await act(async()=>root.render(<ActiveRoomsSection {...props()} rooms={[privateRoom]} error="Request failed"/>));const alert=host.querySelector('[role="alert"]');expect(alert?.textContent).toContain("Couldn't load your rooms");expect(alert?.textContent).toContain("We couldn't retrieve your rooms right now.");expect(host.querySelector('.nc-empty')).toBeNull();expect(host.querySelector('.space-category__count')).toBeNull();expect(host.querySelector('.space-room')).toBeNull();
});
it('invokes the supplied existing refresh handler from Retry',async()=>{
 const options=props();await act(async()=>root.render(<ActiveRoomsSection {...options} error="Request failed"/>));await act(async()=>host.querySelector<HTMLButtonElement>('.spaces-retry')!.click());expect(options.refresh).toHaveBeenCalledOnce();
});
it('classifies private/group entries correctly and uses the existing open-room handler',async()=>{
 const options=props();await act(async()=>root.render(<ActiveRoomsSection {...options} rooms={[privateRoom,groupRoom]}/>));expect(host.querySelector('.space-category--private')?.textContent).toContain(privateRoom.room_name);expect(host.querySelector('.space-category--private')?.textContent).not.toContain(groupRoom.room_name);expect(host.querySelector('.space-category--group')?.textContent).toContain(groupRoom.room_name);expect([...host.querySelectorAll('.space-category__count')].map(node=>node.textContent)).toEqual(['1','1']);await act(async()=>host.querySelector<HTMLButtonElement>('.space-category--group .space-room')!.click());expect(options.openRoom).toHaveBeenCalledWith('GROUP001');
});
it('counts the full response while preserving the six-room category preview',async()=>{
 const rooms=Array.from({length:8},(_,index)=>({...privateRoom,code:`ROOM000${index}`}));await act(async()=>root.render(<ActiveRoomsSection {...props()} rooms={[...rooms,groupRoom]}/>));expect(host.querySelector('.space-category--private .space-category__count')?.textContent).toBe('8');expect(host.querySelectorAll('.space-category--private .space-room').length).toBe(6);expect(host.textContent).toContain('Showing 6 of 8 rooms');expect(host.querySelector('.space-category--group .space-category__count')?.textContent).toBe('1');
});
it('disables header refresh during loading and never duplicates its shared refresh button',async()=>{
 await act(async()=>root.render(<ActiveRoomsSection {...props()} loading/>));expect(host.querySelector<HTMLButtonElement>('.spaces-refresh')?.disabled).toBe(true);expect(host.querySelector('.list-refresh-button')).toBeNull();
});
it('recovers from a real LandingPage fetch failure through its unchanged room-list request',async()=>{
 get.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({data:{data:[privateRoom,groupRoom]}});
 await act(async()=>root.render(<ThemeProvider><MemoryRouter><LandingPage/></MemoryRouter></ThemeProvider>));expect(host.querySelector('.spaces-error')).not.toBeNull();expect(get).toHaveBeenLastCalledWith('/users/local-room-fixture/rooms');
 await act(async()=>host.querySelector<HTMLButtonElement>('.spaces-retry')!.click());expect(get).toHaveBeenCalledTimes(2);expect(host.querySelector('.spaces-error')).toBeNull();expect(host.querySelectorAll('.space-room').length).toBe(2);expect(host.querySelectorAll('.space-category__count').length).toBe(2);
});
it('treats missing room data as a failed response rather than a successful empty result',async()=>{
 get.mockResolvedValue({data:{}});await act(async()=>root.render(<ThemeProvider><MemoryRouter><LandingPage/></MemoryRouter></ThemeProvider>));expect(host.querySelector('.spaces-error')).not.toBeNull();expect(host.querySelector('.space-category__count')).toBeNull();expect(host.querySelector('.space-category .nc-empty')).toBeNull();
});
