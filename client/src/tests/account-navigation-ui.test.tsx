// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountLayout, accountLinks } from '../components/account/AccountLayout';
import { ThemeProvider } from '../hooks/useTheme';
vi.mock('../hooks/useAccount',()=>({useAccount:()=>({profile:{username:'fixture',display_name:'Fixture'},loading:false,logout:vi.fn()})}));
vi.mock('../components/account/NotificationBell',()=>({NotificationBell:()=> <a href="/notifications">Notifications</a>}));
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('scrollTo',vi.fn());Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();localStorage.clear();});
it('retains every account route and correctly marks the active request destination',async()=>{
  await act(async()=>root.render(<ThemeProvider><MemoryRouter initialEntries={['/friends/requests']}><Routes><Route element={<AccountLayout/>}><Route path="/friends/requests" element={<h1>Requests fixture</h1>}/></Route></Routes></MemoryRouter></ThemeProvider>));
  const nav=host.querySelector('#account-navigation')!;
  for(const [path] of accountLinks)expect(nav.querySelector(`a[href="${path}"]`)).not.toBeNull();
  expect(nav.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/friends/requests');
});
it('opens native mobile navigation, closes at its desktop breakpoint and restores focus/scroll',async()=>{
  await act(async()=>root.render(<ThemeProvider><MemoryRouter><Routes><Route element={<AccountLayout/>}><Route path="/" element={<h1>Fixture</h1>}/></Route></Routes></MemoryRouter></ThemeProvider>));
  const trigger=host.querySelector<HTMLButtonElement>('[aria-controls="account-mobile-navigation"]')!;trigger.focus();await act(async()=>trigger.click());
  expect(document.querySelector<HTMLDialogElement>('#account-mobile-navigation')?.open).toBe(true);expect(document.body.style.overflow).toBe('hidden');
  vi.stubGlobal('innerWidth',1024);await act(async()=>window.dispatchEvent(new Event('resize')));
  expect(document.querySelector<HTMLDialogElement>('#account-mobile-navigation')?.open).toBe(false);expect(document.body.style.overflow).toBe('');expect(document.activeElement).toBe(trigger);
});
