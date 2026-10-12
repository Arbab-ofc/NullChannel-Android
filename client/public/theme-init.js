/* global localStorage, window, document */
/* Blocking, same-origin script: compatible with a script-src 'self' CSP. */
(() => {
  let saved;
  try { saved = localStorage.getItem('nullchannel_theme'); } catch { /* Storage can be unavailable. */ }
  const light = saved === 'light' || (saved !== 'dark' && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.classList.toggle('light', light);
  document.documentElement.style.colorScheme = light ? 'light' : 'dark';
})();
