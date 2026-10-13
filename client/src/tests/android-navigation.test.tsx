// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Footer } from '../components/common/Footer';
import { PageTransition } from '../components/common/PageTransition';
import { ThemeProvider } from '../hooks/useTheme';
import LandingPage from '../pages/LandingPage';

vi.mock('../hooks/useAccount', () => ({ useOptionalAccount: () => null }));
vi.mock('../hooks/useLocalSender', () => ({ useLocalSender: () => 'android-navigation-test' }));
vi.mock('../lib/api', () => ({ api: { get: vi.fn(async () => ({ data: { data: [] } })), post: vi.fn() } }));

let host: HTMLDivElement;
let root: Root;
let scrollCalls: Array<{ target: HTMLElement; options?: ScrollIntoViewOptions }>;
let documentScrollTo: ReturnType<typeof vi.fn>;
let windowScrollTo: ReturnType<typeof vi.fn>;
const LocationProbe = () => {
  const location = useLocation();
  return <output data-location>{`${location.pathname}${location.search}${location.hash}`}</output>;
};

function Harness({ initialEntry = '/' }: { initialEntry?: string }) {
  return <ThemeProvider><MemoryRouter initialEntries={[initialEntry]}><PageTransition><Routes>
    <Route path="/" element={<LandingPage/>}/>
    <Route path="/features" element={<LandingPage/>}/>
    <Route path="/privacy" element={<main><h1>Privacy dashboard</h1></main>}/>
    <Route path="/security" element={<main><h1>Security documentation</h1></main>}/>
    <Route path="/terms" element={<main><h1>Terms of use</h1></main>}/>
  </Routes></PageTransition><Footer/><LocationProbe/></MemoryRouter></ThemeProvider>;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  scrollCalls = [];
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: function(this: HTMLElement, options?: ScrollIntoViewOptions) { scrollCalls.push({ target: this, options }); } });
  documentScrollTo = vi.fn();
  windowScrollTo = vi.fn();
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: windowScrollTo });
  const scrollingElement = document.createElement('div');
  Object.defineProperty(scrollingElement, 'scrollTo', { configurable: true, value: documentScrollTo });
  Object.defineProperty(document, 'scrollingElement', { configurable: true, value: scrollingElement });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
  vi.stubGlobal('scrollTo', vi.fn());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const render = async (path = '/') => act(async () => root.render(<Harness initialEntry={path}/>));
const click = async (element: Element) => act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));

it('scrolls to the Features target from the landing header', async () => {
  await render();
  const target = document.getElementById('features')!;
  await click(host.querySelector('.landing-nav a[href="#features"]')!);
  expect(host.querySelector('[data-location]')?.textContent).toBe('/#features');
  expect(scrollCalls.at(-1)).toEqual({ target, options: { block: 'start', behavior: 'smooth' } });
});

it('scrolls to How It Works after the mobile menu finishes closing', async () => {
  vi.useFakeTimers();
  await render();
  await click(host.querySelector('.landing-menu')!);
  const dialog = document.querySelector<HTMLDialogElement>('#public-navigation')!;
  expect(dialog.open).toBe(true);
  await click(dialog.querySelector('a[href="#how-it-works"]')!);
  expect(host.querySelector('.landing-menu')?.getAttribute('aria-expanded')).toBe('false');
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(dialog.open).toBe(false);
  expect(host.querySelector('[data-location]')?.textContent).toBe('/#how-it-works');
  expect(scrollCalls.at(-1)?.target).toBe(document.getElementById('how-it-works'));
});

it('handles repeated taps on the same section without adding a duplicate route location', async () => {
  await render();
  const link = host.querySelector('.landing-nav a[href="#features"]')!;
  await click(link);
  await click(link);
  expect(host.querySelector('[data-location]')?.textContent).toBe('/#features');
  expect(scrollCalls.filter(call => call.target.id === 'features')).toHaveLength(2);
});

it('navigates from another route to the Features section and starts below the sticky header', async () => {
  await render('/privacy');
  await click(host.querySelector('.site-footer a[href="/features"]')!);
  expect(host.querySelector('[data-location]')?.textContent).toBe('/features');
  expect(scrollCalls.at(-1)).toEqual({ target: document.getElementById('features'), options: { block: 'start', behavior: 'smooth' } });
});

it.each([
  ['/privacy', 'Privacy dashboard'],
  ['/security', 'Security documentation'],
  ['/terms', 'Terms of use']
])('uses the existing %s destination and resets the Android document scroll', async (route, heading) => {
  await render('/');
  const link = host.querySelector(`.site-footer a[href="${route}"]`)!;
  await click(link);
  expect(host.querySelector('h1')?.textContent).toBe(heading);
  expect(host.querySelector('[data-location]')?.textContent).toBe(route);
  expect(document.scrollingElement ? documentScrollTo : windowScrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
});

it('respects reduced motion for landing section navigation', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  await render();
  await click(host.querySelector('.landing-nav a[href="#how-it-works"]')!);
  expect(scrollCalls.at(-1)?.options).toEqual({ block: 'start', behavior: 'auto' });
});
