import { Capacitor } from '@capacitor/core';

export const IS_NATIVE_APP = Capacitor.isNativePlatform();
const configuredApiUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const mobileApiUrl = 'https://nullchannel.teleflow.cyou';
const resolvedApiUrl = configuredApiUrl || (IS_NATIVE_APP ? mobileApiUrl : '');
if (IS_NATIVE_APP && !resolvedApiUrl.startsWith('https://')) throw new Error('The Android API endpoint must use HTTPS.');
export const API_URL = resolvedApiUrl;
export const publicAppUrl = (value: string) => {
  const url = new URL(value, IS_NATIVE_APP ? mobileApiUrl : window.location.origin);
  return IS_NATIVE_APP ? new URL(`${url.pathname}${url.search}${url.hash}`, mobileApiUrl).href : url.href;
};
