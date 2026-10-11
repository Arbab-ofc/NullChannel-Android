// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
let root:Root;let container:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.spyOn(console,'error').mockImplementation(()=>undefined);container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('shows accessible recovery controls without rendering private exception text',async()=>{
  function Broken():never {throw new Error('private conversation body');}
  await act(async()=>root.render(<ErrorBoundary><Broken/></ErrorBoundary>));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('This page could not be displayed');expect(container.textContent).not.toContain('private conversation body');expect(container.querySelector('button')?.textContent).toBe('Reload page');
});
