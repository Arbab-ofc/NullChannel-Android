// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountLayout, accountLinks } from '../components/account/AccountLayout';
import { ThemeProvider } from '../hooks/useTheme';
const auth=vi.hoisted(()=>({logout:vi.fn()}));
vi.mock('../hooks/useAccount',()=>({useOptionalAccount:()=>({profile:{username:'fixture',display_name:'Fixture'}}),useAccount:()=>({profile:{username:'fixture',display_name:'Fixture'},loading:false,logout:auth.logout})}));
vi.mock('../components/account/NotificationBell',()=>({NotificationBell:()=> <a href="/notifications">Notifications</a>}));
let root:Root,host:HTMLDivElement;
beforeEach(()=>{auth.logout.mockClear();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('scrollTo',vi.fn());Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();localStorage.clear();});
it('retains every account route and correctly marks the active request destination',async()=>{
  await act(async()=>root.render(<ThemeProvider><MemoryRouter initialEntries={['/friends/requests']}><Routes><Route element={<AccountLayout/>}><Route path="/" element={<h1>Public landing fixture</h1>}/><Route path="/dashboard" element={<h1>Dashboard fixture</h1>}/><Route path="/friends/requests" element={<h1>Requests fixture</h1>}/></Route></Routes></MemoryRouter></ThemeProvider>));
  const nav=host.querySelector('#account-navigation')!;
  expect(nav.querySelector('a[href="/"]')?.textContent).toContain('Home');
  expect(nav.querySelector('a[href="/dashboard"]')?.textContent).toContain('Dashboard');
  for(const [path] of accountLinks)expect(nav.querySelector(`a[href="${path}"]`)).not.toBeNull();
  expect(nav.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/friends/requests');
  await act(async()=>nav.querySelector<HTMLAnchorElement>('a[href="/"]')!.click());
  expect(host.textContent).toContain('Public landing fixture');
  expect(host.querySelector('#account-navigation .account-profile')?.textContent).toContain('fixture');
  await act(async()=>host.querySelector<HTMLAnchorElement>('#account-navigation a[href="/dashboard"]')!.click());
  expect(host.textContent).toContain('Dashboard fixture');
  expect(host.querySelector('a[aria-label="NullChannel home"]')?.getAttribute('href')).toBe('/dashboard');
  expect(auth.logout).not.toHaveBeenCalled();
});
it('preserves mobile drawer Escape focus restoration and closes when entering desktop navigation',async()=>{
  vi.stubGlobal('innerWidth',390);
  await act(async()=>root.render(<ThemeProvider><MemoryRouter><Routes><Route element={<AccountLayout/>}><Route path="/" element={<h1>Fixture</h1>}/></Route></Routes></MemoryRouter></ThemeProvider>));
  const trigger=host.querySelector<HTMLButtonElement>('[aria-controls="account-mobile-navigation"]')!;trigger.focus();await act(async()=>trigger.click());
  expect(document.querySelector<HTMLDialogElement>('#account-mobile-navigation')?.open).toBe(true);expect(document.body.style.overflow).toBe('hidden');
  await act(async()=>document.querySelector('#account-mobile-navigation')!.dispatchEvent(new Event('cancel',{cancelable:true})));
  expect(document.activeElement).toBe(trigger);expect(document.body.style.overflow).toBe('');
  await act(async()=>trigger.click());
  vi.stubGlobal('innerWidth',1024);await act(async()=>window.dispatchEvent(new Event('resize')));
  expect(document.querySelector<HTMLDialogElement>('#account-mobile-navigation')?.open).toBe(false);expect(document.body.style.overflow).toBe('');expect(host.querySelector('.experimental-menu')).not.toBeNull();
});

it('shows separate Home and Dashboard links in the mobile drawer and preserves the account on Home',async()=>{
  vi.stubGlobal('innerWidth',390);
  await act(async()=>root.render(<ThemeProvider><MemoryRouter initialEntries={['/dashboard']}><Routes><Route element={<AccountLayout/>}><Route path="/" element={<h1>Public landing fixture</h1>}/><Route path="/dashboard" element={<h1>Dashboard fixture</h1>}/></Route></Routes></MemoryRouter></ThemeProvider>));
  const trigger=host.querySelector<HTMLButtonElement>('[aria-controls="account-mobile-navigation"]')!;
  await act(async()=>trigger.click());
  const drawer=document.querySelector<HTMLDialogElement>('#account-mobile-navigation')!;
  expect([...drawer.querySelectorAll('a')].map(link=>link.getAttribute('href'))).toContain('/');
  expect(drawer.querySelector('a[href="/"]')?.textContent).toContain('Home');
  expect(drawer.querySelector('a[href="/dashboard"]')?.textContent).toContain('Dashboard');
  await act(async()=>drawer.querySelector<HTMLAnchorElement>('a[href="/"]')!.click());
  expect(host.textContent).toContain('Public landing fixture');
  expect(host.querySelector('#account-navigation .account-profile')?.textContent).toContain('fixture');
  expect(auth.logout).not.toHaveBeenCalled();
});
