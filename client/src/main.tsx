import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';
import './styles/design-system.css';
import './styles/mobile-experience.css';
import './styles/immersive.css';
import { ThemeProvider } from './hooks/useTheme';
import { ensureSession } from './lib/session';
import { isNativeMobile, refreshMobileCredentialsBeforeExpiry } from './lib/mobile-auth';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

if(Capacitor.isNativePlatform()){
  void CapacitorApp.addListener('backButton',({canGoBack})=>{if(canGoBack||window.history.length>1)window.history.back();else void CapacitorApp.exitApp();}).catch(()=>undefined);
  void CapacitorApp.addListener('resume',async()=>{await refreshMobileCredentialsBeforeExpiry().catch(()=>undefined);window.dispatchEvent(new Event('nullchannel-app-resume'));}).catch(()=>undefined);
  void CapacitorApp.addListener('pause',()=>window.dispatchEvent(new Event('nullchannel-app-pause'))).catch(()=>undefined);
}
const root = ReactDOM.createRoot(document.getElementById('root')!);
const start = async () => {
  // Preserve the established guest identity invariant before guest components mount.
  try { await ensureSession(); } catch { /* Account recovery and public pages remain available. */ }
  if(isNativeMobile()){
    await refreshMobileCredentialsBeforeExpiry().catch(()=>undefined);
    window.setInterval(()=>{void refreshMobileCredentialsBeforeExpiry().catch(()=>undefined);},60_000);
  }
  root.render(<React.StrictMode><ThemeProvider><BrowserRouter><App /></BrowserRouter></ThemeProvider></React.StrictMode>);
  window.setInterval(() => { void ensureSession().catch(() => undefined); },10*60*1000);
};
void start();
