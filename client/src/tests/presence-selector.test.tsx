// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PresenceSelector, type PresenceStatus } from '../components/account/PresenceSelector';

const changed = vi.fn();
function Harness() {
  const [status, setStatus] = useState<PresenceStatus>('online');
  return <><PresenceSelector value={status} onChange={next => { changed(next); setStatus(next); }}/><output>{status}</output></>;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { changed.mockClear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const mount = () => act(async () => root.render(<Harness/>));
const trigger = () => host.querySelector<HTMLButtonElement>('.presence-selector__trigger')!;

it.each(['online', 'away', 'invisible'] as const)('selects %s and updates the controlled status', async status => {
  await mount();
  await act(async () => trigger().click());
  const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(listbox.querySelector('[aria-selected="true"]')?.id).toContain('online');
  const option = document.getElementById(listbox.id.replace(/-listbox$/, `-${status}`));
  await act(async () => option!.click());
  expect(changed).toHaveBeenCalledWith(status);
  expect(host.querySelector('output')?.textContent).toBe(status);
  expect(trigger().textContent).toContain(status === 'invisible' ? 'Invisible' : status[0].toUpperCase() + status.slice(1));
});

it('announces the selected option and supports arrow plus Enter selection', async () => {
  await mount();
  trigger().focus(); await act(async () => trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(listbox.getAttribute('aria-activedescendant')).toContain('online');
  await act(async () => listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  expect(listbox.getAttribute('aria-activedescendant')).toContain('away');
  await act(async () => listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(changed).toHaveBeenCalledWith('away');
  expect(document.activeElement).toBe(trigger());
});

it('closes on Escape and outside pointer interaction', async () => {
  await mount(); await act(async () => trigger().click());
  const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
  await act(async () => listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  await act(async () => trigger().click());
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
