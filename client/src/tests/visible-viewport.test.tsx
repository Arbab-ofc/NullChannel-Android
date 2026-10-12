// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVisibleViewport } from '../hooks/useVisibleViewport';
let root: Root, host: HTMLElement;
let visible: EventTarget & { height: number; offsetTop: number; scale: number };
const Fixture = () => <main style={useVisibleViewport()} />;
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  visible = Object.assign(new EventTarget(),{ height: 844,offsetTop: 0,scale: 1 }); vi.stubGlobal('visualViewport',visible);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Fixture />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('tracks keyboard-sized viewports and viewport offsets without changing pinch zoom behavior',async () => {
  expect(host.querySelector('main')!.style.height).toBe('844px');
  visible.height = 430; visible.offsetTop = 20; visible.dispatchEvent(new Event('resize'));
  await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(host.querySelector('main')!.style.height).toBe('430px'); expect(host.querySelector('main')!.style.top).toBe('20px');
  visible.scale = 2; visible.dispatchEvent(new Event('scroll')); await act(async () => vi.advanceTimersByTimeAsync(32));
  expect(host.querySelector('main')!.style.height).toBe('');
});
it('removes visual viewport listeners and pending frames on unmount',async () => {
  const remove = vi.spyOn(visible,'removeEventListener'); visible.dispatchEvent(new Event('resize'));
  await act(async () => root.render(null)); expect(remove).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTimeAsync(32));
});
it('detects an editable keyboard reduction and preserves normal viewport behavior on blur',async()=>{
 const {useViewportState}=await import('../hooks/useVisibleViewport');
 function KeyboardFixture(){const state=useViewportState();return <div data-keyboard={state.keyboardOpen}><input aria-label="Composer"/></div>;}
 await act(async()=>root.render(<KeyboardFixture/>));const input=host.querySelector('input')!;await act(async()=>input.focus());visible.height=430;visible.dispatchEvent(new Event('resize'));await act(async()=>vi.advanceTimersByTimeAsync(32));expect(host.firstElementChild?.getAttribute('data-keyboard')).toBe('true');await act(async()=>input.blur());await act(async()=>vi.advanceTimersByTimeAsync(32));expect(host.firstElementChild?.getAttribute('data-keyboard')).toBe('false');
});
