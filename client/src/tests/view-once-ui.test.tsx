// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {ViewOnceMedia} from '../components/chat/ViewOnceMedia';
const {get}=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../lib/api',()=>({api:{get}}));
let root:Root;let container:HTMLDivElement;const create=vi.fn(()=> 'blob:temporary-test');const revoke=vi.fn();
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.clearAllMocks();URL.createObjectURL=create;URL.revokeObjectURL=revoke;container=document.createElement('div');document.body.append(container);root=createRoot(container);get.mockResolvedValue({data:new Blob(['image'],{type:'image/png'})});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('never preloads protected media and consumes only when explicitly opened',async()=>{
 await act(async()=>root.render(<ViewOnceMedia url="/api/media/files/secret" type="image"/>));expect(get).not.toHaveBeenCalled();expect(container.querySelector('img')).toBeNull();
 await act(async()=>container.querySelector('button')!.click());expect(get).toHaveBeenCalledWith(new URL('/api/media/files/secret?open=1',window.location.origin).href,expect.objectContaining({responseType:'blob',signal:expect.any(AbortSignal)}));expect(container.querySelector('img')?.src).toBe('blob:temporary-test');
 await act(async()=>container.querySelector('button')!.click());expect(revoke).toHaveBeenCalledWith('blob:temporary-test');expect(container.querySelector('img')).toBeNull();expect(container.textContent).toContain('cannot be restored');expect(get).toHaveBeenCalledOnce();
});
it('does not fetch or offer reopening for an already consumed attachment',async()=>{
 await act(async()=>root.render(<ViewOnceMedia url="/api/media/files/secret" type="voice" consumed/>));expect(get).not.toHaveBeenCalled();expect(container.querySelector('audio')).toBeNull();expect(container.querySelector('button')).toBeNull();
});
it('aborts an in-flight opening when the message expires or room terminates',async()=>{
 let resolve!:(value:unknown)=>void;get.mockImplementation(()=>new Promise(done=>{resolve=done;}));
 await act(async()=>root.render(<ViewOnceMedia url="/api/media/files/secret" type="image"/>));await act(async()=>container.querySelector('button')!.click());const signal=get.mock.calls[0][1].signal as AbortSignal;
 await act(async()=>root.render(null));expect(signal.aborted).toBe(true);await act(async()=>resolve({data:new Blob(['secret'])}));expect(create).not.toHaveBeenCalled();
});
