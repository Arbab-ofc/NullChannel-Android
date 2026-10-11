// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Socket } from 'socket.io-client';
import { GroupTools } from '../components/chat/GroupTools';
const {get,post} = vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../lib/account',()=>({accountApi:{get,post},accountError:()=> 'Request failed.'}));
let root:Root;let container:HTMLDivElement;
const socket={on:vi.fn(),off:vi.fn()} as unknown as Socket;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.clearAllMocks();container=document.createElement('div');document.body.append(container);root=createRoot(container);get.mockResolvedValue({data:{data:[{id:'testpoll',question:'Pick one',options:['First','Second'],expiresAt:new Date(Date.now()+10000).toISOString(),closed:false,results:[],myChoice:null}]}});post.mockResolvedValue({data:{data:{updated:true}}});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('members can vote with zero-based option indices and cannot see moderation controls',async()=>{
  await act(async()=>root.render(<GroupTools code="ABCDEFGH" selfSenderId="temporary-self" role="member" participants={[]} socket={socket}/>));
  expect(container.textContent).not.toContain('Current-room moderation');expect(container.textContent).not.toContain('Temporary invite link');
  const vote=[...container.querySelectorAll('button')].find(b=>b.textContent?.startsWith('Second'))!;
  await act(async()=>vote.click());
  expect(post).toHaveBeenCalledWith('/registered/rooms/ABCDEFGH/polls/testpoll/vote',{choice:1});
});
it('removes its room event listener when leaving the chat',async()=>{
  await act(async()=>root.render(<GroupTools code="ABCDEFGH" selfSenderId="temporary-self" role="owner" participants={[]} socket={socket}/>));
  expect(socket.on).toHaveBeenCalledWith('poll:update',expect.any(Function));
  await act(async()=>root.render(null));expect(socket.off).toHaveBeenCalledWith('poll:update',expect.any(Function));
});
