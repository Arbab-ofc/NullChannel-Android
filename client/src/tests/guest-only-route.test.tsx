// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuestOnlyRoute } from '../components/account/GuestOnlyRoute';

const auth = vi.hoisted(() => ({ state: { profile: null as null | { username: string }, loading: false, error: '', refresh: vi.fn() } }));
vi.mock('../hooks/useAccount', () => ({ useAccount: () => auth.state }));

let root: Root;
let host: HTMLDivElement;
function CurrentPath() { return <output data-path>{useLocation().pathname}</output>; }
function render(initial: string[]) {
  return root.render(<MemoryRouter initialEntries={initial}><Routes>
    <Route path="/login" element={<GuestOnlyRoute><h1>Login form</h1></GuestOnlyRoute>} />
    <Route path="/signup" element={<GuestOnlyRoute><h1>Registration form</h1></GuestOnlyRoute>} />
    <Route path="/dashboard" element={<><h1>Authenticated home</h1><CurrentPath/></>} />
    <Route path="/" element={<Navigate to="/login" replace/>}/>
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  auth.state = { profile: null, loading: false, error: '', refresh: vi.fn() };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it.each(['/login', '/signup'])('keeps the signed-out %s page accessible', async (path) => {
  await act(async () => render([path]));
  expect(host.textContent).toContain(path === '/login' ? 'Login form' : 'Registration form');
});

it.each(['/login', '/signup'])('replaces an authenticated direct or refreshed %s visit with Home', async (path) => {
  auth.state.profile = { username: 'signed-in' };
  await act(async () => render(['/dashboard', path]));
  expect(host.textContent).toContain('Authenticated home');
  expect(host.querySelector('[data-path]')?.textContent).toBe('/dashboard');
});

it('waits for session restoration before rendering an auth page', async () => {
  auth.state.loading = true;
  await act(async () => render(['/login']));
  expect(host.textContent).not.toContain('Login form');
  auth.state.loading = false; auth.state.profile = { username: 'restored' };
  await act(async () => render(['/login']));
  expect(host.textContent).toContain('Authenticated home');
});

it('offers retry when session validation is unavailable instead of exposing auth actions', async () => {
  auth.state.error = 'Unable to validate session';
  await act(async () => render(['/signup']));
  expect(host.textContent).not.toContain('Registration form');
  await act(async () => host.querySelector('button')!.click());
  expect(auth.state.refresh).toHaveBeenCalledOnce();
});
