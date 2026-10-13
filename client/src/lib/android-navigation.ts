import { Capacitor } from '@capacitor/core';

export function isAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function scrollAndroidToElement(target: HTMLElement): void {
  if (!isAndroidApp()) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
}

export function scrollAndroidToLocation(pathname: string, hash: string): boolean {
  if (!isAndroidApp()) return false;

  if (hash) {
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return false;
    }
    const target = document.getElementById(id);
    if (!target) return false;
    scrollAndroidToElement(target);
    return true;
  }

  // The established /features destination is the Features section of the
  // landing page, rather than a separate page.
  if (pathname === '/features') {
    const target = document.getElementById('features');
    if (!target) return false;
    scrollAndroidToElement(target);
    return true;
  }

  const scroller = document.scrollingElement;
  if (scroller) scroller.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  else window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  return true;
}
