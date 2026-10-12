// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../hooks/useTheme';
import AuthPage from '../pages/AuthPage';
const {post} = vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../hooks/useAccount',()=>({useOptionalAccount:()=>({profile:null}),useAccount:()=>({refresh:vi.fn()})}));
vi.mock('../lib/account',()=>({accountApi:{post},accountError:()=> 'Request failed.'}));
let root:Root;let container:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.clearAllMocks();container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('rejects password mismatch before contacting real registration backend',async()=>{
  await act(async()=>root.render(<ThemeProvider><MemoryRouter><AuthPage mode="signup"/></MemoryRouter></ThemeProvider>));
  const input=(name:string)=>container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  input('username').value='newfriend';input('email').value='newfriend@example.test';input('password').value='long-password-123';input('confirm').value='different-password';
  await act(async()=>{container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Passwords do not match.');expect(post).not.toHaveBeenCalled();
});
it('gives neutral reset feedback and submits only the entered email',async()=>{
  post.mockResolvedValue({data:{}});
  await act(async()=>root.render(<ThemeProvider><MemoryRouter><AuthPage mode="forgot-password"/></MemoryRouter></ThemeProvider>));
  container.querySelector<HTMLInputElement>('[name="email"]')!.value='private@example.test';
  await act(async()=>{container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(post).toHaveBeenCalledWith('/account/forgot-password',{email:'private@example.test'});expect(container.querySelector('[role="status"]')?.textContent).toContain('If this email');
});
