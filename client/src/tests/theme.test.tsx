// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
let root: Root, host: HTMLDivElement;
let changed: (() => void) | undefined;
let light = true;
function Fixture() { const {theme,toggleTheme}=useTheme();return <button onClick={toggleTheme}>{theme}</button>; }
beforeEach(()=>{localStorage.clear();light=true;changed=undefined;vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({get matches(){return light;},addEventListener:(_event:string,listener:()=>void)=>{changed=listener;},removeEventListener:vi.fn()}));host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
it('follows system changes until a choice is explicitly persisted',async()=>{
  await act(async()=>root.render(<ThemeProvider><Fixture/></ThemeProvider>));
  expect(document.documentElement.classList.contains('light')).toBe(true);expect(localStorage.getItem('nullchannel_theme')).toBeNull();
  await act(async()=>{light=false;changed?.();});expect(host.textContent).toBe('dark');
  await act(async()=>host.querySelector('button')!.click());expect(localStorage.getItem('nullchannel_theme')).toBe('light');
  await act(async()=>{light=false;changed?.();});expect(host.textContent).toBe('light');
});
it('restores an explicit saved theme instead of overriding it with the OS theme',async()=>{
  localStorage.setItem('nullchannel_theme','dark');await act(async()=>root.render(<ThemeProvider><Fixture/></ThemeProvider>));expect(host.textContent).toBe('dark');expect(document.documentElement.style.colorScheme).toBe('dark');
});
it('keeps theme controls usable when browser storage is unavailable',async()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});
  await act(async()=>root.render(<ThemeProvider><Fixture/></ThemeProvider>));await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toBe('dark');
});
