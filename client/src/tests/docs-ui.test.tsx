// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../hooks/useTheme';
import DocsPage from '../pages/DocsPage';
let root:Root;let container:HTMLDivElement;
const fixture=[{method:'get',route:'/api/registered/explore',auth:'registered',tag:'Discovery',example:{}},{method:'post',route:'/api/account/login',auth:'public',tag:'Authentication',example:{email:'user@example.test',password:'example-password'}}];
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>fixture}));container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('loads endpoint reference and filters actual documentation by search text',async()=>{
  await act(async()=>root.render(<ThemeProvider><MemoryRouter><DocsPage/></MemoryRouter></ThemeProvider>));
  expect(fetch).toHaveBeenCalledWith('/endpoint-reference.json',expect.objectContaining({signal:expect.any(AbortSignal)}));
  expect(container.querySelectorAll('.docs-endpoint')).toHaveLength(2);
  const search=container.querySelector<HTMLInputElement>('#docs-search')!;
  await act(async()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;set.call(search,'explore');search.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(container.querySelectorAll('.docs-endpoint')).toHaveLength(1);expect(container.querySelector('.docs-endpoint')?.textContent).toContain('/api/registered/explore');expect(container.querySelector('.docs-endpoint')?.textContent).not.toContain('/api/account/login');
});
it('announces endpoint fetch failure without leaving an infinite loading state',async()=>{
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  await act(async()=>root.render(<ThemeProvider><MemoryRouter><DocsPage/></MemoryRouter></ThemeProvider>));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Unable to load endpoint documentation');
});
