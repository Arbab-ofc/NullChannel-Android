// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SwipeableMessage,replyIntent} from '../components/chat/SwipeableMessage';
import {AttachmentPreview,attachmentError,fileSize} from '../components/chat/AttachmentPreview';
import {FloatingDateSeparator,JumpToLatest,dateLabel} from '../components/chat/TranscriptChrome';
import {PullToRefresh,refreshIntent} from '../components/mobile/PullToRefresh';
import {MobileBottomNavigation} from '../components/mobile/MobileBottomNavigation';
import {Modal} from '../components/common/Modal';
import {Skeleton} from '../components/common/Skeleton';
import {PageTransition} from '../components/common/PageTransition';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('innerWidth',390);
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
function pointer(node:Element,type:string,x:number,y:number){const event=new Event(type,{bubbles:true});Object.assign(event,{pointerType:'touch',isPrimary:true,pointerId:1,clientX:x,clientY:y});node.dispatchEvent(event);}
it('requires deliberate horizontal reply intent and rejects vertical or backwards gestures',()=>{expect(replyIntent(63,0)).toBe(false);expect(replyIntent(64,1)).toBe(true);expect(replyIntent(70,60)).toBe(false);expect(replyIntent(-90,0)).toBe(false);});
it('uses the reply callback once on release and cancels vertical scroll, cancellation, controls and screen edges',async()=>{
 const reply=vi.fn();await act(async()=>root.render(<SwipeableMessage enabled onReply={reply}><p>Message</p><button>Action</button></SwipeableMessage>));
 const node=host.firstElementChild!;Object.assign(node,{setPointerCapture:vi.fn()});
 await act(async()=>{pointer(node,'pointerdown',100,100);pointer(node,'pointermove',170,101);pointer(node,'pointerup',170,101);});expect(reply).toHaveBeenCalledTimes(1);
 await act(async()=>{pointer(node,'pointerdown',100,100);pointer(node,'pointermove',110,130);pointer(node,'pointerup',190,130);pointer(node,'pointerdown',100,100);pointer(node,'pointercancel',180,100);pointer(node,'pointerup',180,100);pointer(host.querySelector('button')!,'pointerdown',100,100);pointer(node,'pointerup',180,100);pointer(node,'pointerdown',10,100);pointer(node,'pointerup',100,100);});expect(reply).toHaveBeenCalledTimes(1);
});
it('does not reply while a modal is open or permission is absent',async()=>{const reply=vi.fn();const modal=document.createElement('dialog');modal.open=true;document.body.append(modal);await act(async()=>root.render(<SwipeableMessage enabled onReply={reply}>Message</SwipeableMessage>));await act(async()=>{pointer(host.firstElementChild!,'pointerdown',100,10);pointer(host.firstElementChild!,'pointerup',200,10);});modal.remove();expect(reply).not.toHaveBeenCalled();await act(async()=>root.render(<SwipeableMessage enabled={false} onReply={reply}>Message</SwipeableMessage>));await act(async()=>{pointer(host.firstElementChild!,'pointerdown',100,10);pointer(host.firstElementChild!,'pointerup',200,10);});expect(reply).not.toHaveBeenCalled();});
it('formats local calendar dates, including yesterday across month boundaries',()=>{const now=new Date(2026,9,1,12);expect(dateLabel(new Date(2026,9,1,1).toISOString(),now)).toBe('Today');expect(dateLabel(new Date(2026,8,30,23).toISOString(),now)).toBe('Yesterday');expect(dateLabel('bad',now)).toBe('');});
it('updates the visible date through intersection changes and clears an emptied transcript',async()=>{
 let callback:IntersectionObserverCallback=()=>undefined;const disconnect=vi.fn();
 vi.stubGlobal('IntersectionObserver',class{constructor(cb:IntersectionObserverCallback){callback=cb;}observe=vi.fn();disconnect=disconnect;});
 const transcript=document.createElement('section');const article=document.createElement('article');article.dataset.messageDate=new Date().toISOString();transcript.append(article);
 await act(async()=>root.render(<FloatingDateSeparator element={transcript} revision={1}/>));
 await act(async()=>callback([{target:article,isIntersecting:true,boundingClientRect:{top:0}} as unknown as IntersectionObserverEntry],{} as IntersectionObserver));expect(host.textContent).toBe('Today');article.remove();await act(async()=>root.render(<FloatingDateSeparator element={transcript} revision={2}/>));expect(host.textContent).toBe('');expect(disconnect).toHaveBeenCalled();
});
it('shows jump for older reading even without unread and uses existing handler',async()=>{const jump=vi.fn();await act(async()=>root.render(<JumpToLatest visible unread={0} onClick={jump}/>));await act(async()=>host.querySelector('button')!.click());expect(jump).toHaveBeenCalledTimes(1);await act(async()=>root.render(<JumpToLatest visible={false} unread={3} onClick={jump}/>));expect(host.textContent).toBe('3');await act(async()=>root.render(<JumpToLatest visible={false} unread={0} onClick={jump}/>));expect(host.textContent).toBe('');});
it('validates existing attachment limits and formats sizes',()=>{expect(fileSize(40)).toBe('40 B');expect(fileSize(1024)).toBe('1.0 KB');expect(fileSize(1048576)).toBe('1.0 MB');expect(attachmentError(new File(['a'],'x.svg',{type:'image/svg+xml'}),'image')).not.toBe('');expect(attachmentError(new File(['a'],'x.exe'),'file')).not.toBe('');expect(attachmentError(new File(['a'],'x.pdf'),'file')).toBe('');});
it('revokes local preview URLs on replacement/removal and allows remove before upload',async()=>{
 const create=vi.fn(()=> 'blob:fixture'),revoke=vi.fn();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});const remove=vi.fn(),send=vi.fn();
 const file=new File(['a'],'a.png',{type:'image/png'});await act(async()=>root.render(<AttachmentPreview attachment={{file,kind:'image',status:'ready'}} remove={remove} send={send} disabled={false}/>));expect(host.querySelector('img')?.src).toBe('blob:fixture');await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Remove attachment"]')!.click());expect(remove).toHaveBeenCalledOnce();await act(async()=>root.render(null));expect(revoke).toHaveBeenCalledWith('blob:fixture');
});
it('shows real transfer progress and never offers unsafe retries or upload cancellation',()=>{const file=new File(['x'],'a.pdf');const html=renderToStaticMarkup(<AttachmentPreview attachment={{file,kind:'file',status:'uploading',progress:37}} remove={()=>undefined} send={()=>undefined} disabled/>);expect(html).toContain('value="37"');expect(html).toContain('disabled');const failed=renderToStaticMarkup(<AttachmentPreview attachment={{file,kind:'file',status:'failed',error:'Completion unknown'}} remove={()=>undefined} send={()=>undefined} disabled/>);expect(failed).toContain('Completion unknown');expect(failed).not.toContain('Retry');expect(failed).not.toContain('Send attachment');});
it('uses real mobile destinations and marks the active route',async()=>{await act(async()=>root.render(<MemoryRouter initialEntries={['/privacy']}><MobileBottomNavigation/></MemoryRouter>));expect(host.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/privacy');expect(host.querySelector('a[href="/chats"]')).toBeNull();});
it('provides one skeleton announcement and no fake placeholder content',()=>{const html=renderToStaticMarkup(<Skeleton kind="messages" label="Loading history"/>);expect((html.match(/role="status"/g)||[]).length).toBe(1);expect(html).toContain('aria-hidden="true"');});
it('closes a sheet on Escape and restores its invoking control',async()=>{const origin=document.createElement('button');document.body.append(origin);origin.focus();const close=vi.fn();await act(async()=>root.render(<Modal sheet titleId="heading" close={close}><h2 id="heading">Attachments</h2><button>File</button></Modal>));const dialog=document.querySelector('dialog')!;expect(dialog.open).toBe(true);await act(async()=>dialog.dispatchEvent(new Event('cancel',{bubbles:true,cancelable:true})));expect(close).toHaveBeenCalledOnce();await act(async()=>root.render(null));expect(document.activeElement).toBe(origin);origin.remove();});
it('dismisses sheets only from a deliberate handle drag, leaving nested content gestures alone',async()=>{const close=vi.fn();await act(async()=>root.render(<Modal sheet titleId="h" close={close}><h2 id="h">Actions</h2><div>Scrollable content</div></Modal>));const handle=document.querySelector('.sheet-handle')!;Object.assign(handle,{setPointerCapture:vi.fn()});await act(async()=>{pointer(handle,'pointerdown',100,100);pointer(handle,'pointerup',100,150);});expect(close).not.toHaveBeenCalled();await act(async()=>{pointer(handle,'pointerdown',100,100);pointer(handle,'pointerup',100,180);});expect(close).toHaveBeenCalledOnce();});
it('requires vertical refresh intent and deduplicates one active refresh',async()=>{
 expect(refreshIntent(50,73)).toBe(false);expect(refreshIntent(0,72)).toBe(true);let finish:()=>void=()=>undefined;const refresh=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));await act(async()=>root.render(<PullToRefresh refresh={refresh}><p>Rooms</p></PullToRefresh>));const node=host.firstElementChild!;
 const touch=(type:string,x:number,y:number)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{touches:type==='touchend'?[]:[{clientX:x,clientY:y}]});node.dispatchEvent(event);};
 await act(async()=>{touch('touchstart',100,100);touch('touchmove',100,180);touch('touchend',100,180);touch('touchstart',100,100);touch('touchmove',100,180);touch('touchend',100,180);});expect(refresh).toHaveBeenCalledOnce();await act(async()=>finish());expect(host.querySelector('p')?.textContent).toBe('Rooms');expect(host.querySelector('button')?.disabled).toBe(false);
});
it('focuses the route heading without scrolling and leaves chat focus alone',async()=>{await act(async()=>root.render(<MemoryRouter initialEntries={['/explore']}><PageTransition><h1>Explore</h1></PageTransition></MemoryRouter>));expect(document.activeElement).toBe(host.querySelector('h1'));});
it('restores pull-to-refresh controls after a failed request and ignores non-top, modal and edge starts',async()=>{
 const refresh=vi.fn().mockRejectedValue(new Error('offline'));await act(async()=>root.render(<PullToRefresh refresh={refresh}><p>List</p></PullToRefresh>));await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());expect(host.querySelector('[role="alert"]')?.textContent).toContain('Refresh failed');expect(host.querySelector('button')?.disabled).toBe(false);
 const node=host.firstElementChild!;function pull(x:number){for(const [type,y] of [['touchstart',100],['touchmove',200],['touchend',200]] as const){const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{touches:type==='touchend'?[]:[{clientX:x,clientY:y}]});node.dispatchEvent(event);}}
 vi.stubGlobal('scrollY',30);await act(async()=>pull(100));vi.stubGlobal('scrollY',0);await act(async()=>pull(10));const dialog=document.createElement('dialog');dialog.open=true;document.body.append(dialog);await act(async()=>pull(100));dialog.remove();expect(refresh).toHaveBeenCalledOnce();
});
it('hides mobile navigation during a focused virtual keyboard reduction',async()=>{
 vi.useFakeTimers();const visible=Object.assign(new EventTarget(),{height:844,offsetTop:0,scale:1});vi.stubGlobal('visualViewport',visible);vi.stubGlobal('innerHeight',844);
 await act(async()=>root.render(<MemoryRouter><MobileBottomNavigation/><input aria-label="Search"/></MemoryRouter>));await act(async()=>host.querySelector('input')!.focus());visible.height=400;visible.dispatchEvent(new Event('resize'));await act(async()=>vi.advanceTimersByTimeAsync(32));expect(host.querySelector('nav')?.hidden).toBe(true);await act(async()=>host.querySelector('input')!.blur());await act(async()=>vi.advanceTimersByTimeAsync(32));expect(host.querySelector('nav')?.hidden).toBe(false);vi.useRealTimers();
});
