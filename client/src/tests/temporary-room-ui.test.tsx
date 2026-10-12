// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {TemporaryChatButton,cooldownLabel} from '../components/rooms/TemporaryChatButton';
const {get,post,on,off}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),on:vi.fn(),off:vi.fn()}));
vi.mock('../lib/account',()=>({accountApi:{get,post},accountError:()=> 'Unable to verify eligibility'}));
vi.mock('../lib/account-socket',()=>({accountSocket:{on,off}}));
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
const render=async()=>act(async()=>root.render(<MemoryRouter><TemporaryChatButton username="friend"/></MemoryRouter>));
it('disables pending invitations and reopens the existing active room',async()=>{get.mockResolvedValue({data:{data:{state:'pending'}}});await render();expect(host.querySelector('button')?.disabled).toBe(true);expect(host.textContent).toContain('Invitation already pending');const reconcile=on.mock.calls.find(([event])=>event==='rooms:updated')![1];get.mockResolvedValue({data:{data:{state:'active',code:'TESTROOM',expires_at:new Date(Date.now()+60000).toISOString()}}});await act(async()=>reconcile());expect(host.querySelector('a')?.getAttribute('href')).toBe('/chat/TESTROOM');expect(post).not.toHaveBeenCalled();});
it('sends only once and enters pending state after confirmed success',async()=>{get.mockResolvedValue({data:{data:{state:'available'}}});post.mockResolvedValue({data:{}});await render();await act(async()=>host.querySelector('button')!.click());expect(post).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('Invitation already pending');});
it('displays server cooldown without sending and cleans reconnect listeners',async()=>{get.mockResolvedValue({data:{data:{state:'cooldown',retry_at:new Date(Date.now()+900000).toISOString()}}});await render();expect(host.querySelector('button')?.disabled).toBe(true);expect(host.textContent).toContain('Try again in');expect(post).not.toHaveBeenCalled();await act(async()=>root.render(null));expect(off).toHaveBeenCalledWith('connect',expect.any(Function));});
it('shows an error rather than an available invitation after failed validation',async()=>{get.mockRejectedValue(new Error('offline'));await render();expect(host.querySelector('[role="alert"]')?.textContent).toContain('Unable to verify eligibility');expect(host.querySelector('button')?.disabled).toBe(true);});
it('formats remaining cooldown from an absolute server deadline',()=>{expect(cooldownLabel(new Date(872000).toISOString(),0)).toBe('Try again in 14m 32s');});
