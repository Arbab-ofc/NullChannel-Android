// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {SettingsPage} from '../pages/AccountPages';
const {get,post,refresh}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),refresh:vi.fn()}));
vi.mock('../hooks/useAccount',()=>({useOptionalAccount:()=>({profile:null}),useAccount:()=>({profile:{username:'deleting',deletion_pending:true},refresh})}));
vi.mock('../lib/account',()=>({accountApi:{get,post},accountError:()=> 'Deletion failed.'}));
vi.mock('../lib/account-socket',()=>({accountSocket:{on:vi.fn(),off:vi.fn()}}));
let root:Root;let container:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.clearAllMocks();vi.spyOn(window,'confirm').mockReturnValue(true);post.mockResolvedValue({data:{data:{deleted:true}}});container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('offers reauthenticated deletion recovery without fetching or enabling blocked account operations',async()=>{
 await act(async()=>root.render(<MemoryRouter><SettingsPage/></MemoryRouter>));expect(container.textContent).toContain('Complete account deletion');expect(get).not.toHaveBeenCalled();expect(container.textContent).not.toContain('Save preferences');
 container.querySelector<HTMLInputElement>('[name="current_password"]')!.value='current-password';
 await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(post).toHaveBeenCalledWith('/account/delete',{password:'current-password'});expect(refresh).toHaveBeenCalledOnce();
});
it('refreshes durable pending state and notifies other tabs when deletion is interrupted',async()=>{
 post.mockRejectedValueOnce(new Error('storage unavailable'));
 await act(async()=>root.render(<MemoryRouter><SettingsPage/></MemoryRouter>));container.querySelector<HTMLInputElement>('[name="current_password"]')!.value='current-password';
 await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(refresh).toHaveBeenCalledOnce();expect(localStorage.getItem('nullchannel_account_event')).toMatch(/^changed:\d+$/);expect(container.textContent).toContain('Deletion failed.');
});
