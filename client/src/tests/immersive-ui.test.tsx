// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ThemeProvider} from '../hooks/useTheme';
import {ThemeToggle} from '../components/common/ThemeToggle';
import {CopyButton} from '../components/common/CopyButton';
import {ToggleSwitch} from '../components/common/ToggleSwitch';
import {ExpiryCountdown} from '../components/chat/ExpiryCountdown';
import {expiryInfo,roomAtmosphere} from '../lib/room-presentation';
import {RoomCard} from '../components/rooms/RoomCard';
import {ActiveRoomsSection} from '../components/rooms/ActiveRoomsSection';
import {KineticHeadline,PrivacyJourney} from '../components/immersive/LandingMotion';
import {RoomCreatedFeedback} from '../components/immersive/RoomCreatedFeedback';
import {LoadingSignal} from '../components/common/LoadingSignal';
import LandingPage from '../pages/LandingPage';
import initScript from '../../public/theme-init.js?raw';
import css from '../styles/immersive.css?raw';
const {post,get}=vi.hoisted(()=>({post:vi.fn(),get:vi.fn()}));
vi.mock('../lib/api',()=>({api:{get,post}}));
vi.mock('../hooks/useLocalSender',()=>({useLocalSender:()=> 'immersive-fixture'}));
let root:Root,host:HTMLDivElement,systemChange:()=>void;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);localStorage.clear();document.documentElement.className='';get.mockResolvedValue({data:{data:[]}});post.mockReset();
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:(_name:string,callback:()=>void)=>{systemChange=callback;},removeEventListener:vi.fn()}));
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();localStorage.clear();});
it('offers explicit OLED, persists it and restores it without changing system preference behavior',async()=>{
 await act(async()=>root.render(<ThemeProvider><ThemeToggle/></ThemeProvider>));const oled=host.querySelector<HTMLInputElement>('input[value="oled"]')!;await act(async()=>oled.click());expect(localStorage.getItem('nullchannel_theme')).toBe('oled');expect(document.documentElement.classList.contains('oled')).toBe(true);expect(document.documentElement.classList.contains('light')).toBe(false);expect(document.documentElement.style.colorScheme).toBe('dark');await act(async()=>systemChange());expect(oled.checked).toBe(true);
 await act(async()=>root.render(null));await act(async()=>root.render(<ThemeProvider><ThemeToggle/></ThemeProvider>));expect(host.querySelector<HTMLInputElement>('input[value="oled"]')?.checked).toBe(true);
});
it('initializes OLED before React even when the system prefers light',()=>{
 localStorage.setItem('nullchannel_theme','oled');const system={matchMedia:()=>({matches:true})};new Function('window','document','localStorage',initScript)(system,document,localStorage);expect(document.documentElement.classList.contains('oled')).toBe(true);expect(document.documentElement.classList.contains('light')).toBe(false);expect(document.documentElement.dataset.themeReady).toBe('true');expect(css).toContain('--bg:0 0% 0%');
});
it('shows copy confirmation only after a successful clipboard write and resets it',async()=>{
 vi.useFakeTimers();let finish:()=>void=()=>undefined;const write=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:write}});const confirmed=vi.fn();await act(async()=>root.render(<CopyButton value="ROOM0001" label="Copy room" onCopied={confirmed}/>));await act(async()=>host.querySelector('button')!.click());expect(host.textContent).not.toContain('Copied');expect(host.querySelector('button')?.disabled).toBe(true);await act(async()=>finish());expect(confirmed).toHaveBeenCalledOnce();expect(host.textContent).toContain('Copied');await act(async()=>vi.advanceTimersByTimeAsync(2000));expect(host.querySelector('button')?.textContent).toBe('Copy room');expect(write).toHaveBeenCalledWith('ROOM0001');
});
it('does not show success when clipboard access is denied',async()=>{
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockRejectedValue(new Error('denied'))}});const confirmed=vi.fn(),failed=vi.fn();await act(async()=>root.render(<CopyButton value="ROOM0001" onCopied={confirmed} onError={failed}/>));await act(async()=>host.querySelector('button')!.click());expect(confirmed).not.toHaveBeenCalled();expect(failed).toHaveBeenCalledOnce();expect(host.textContent).toContain('Copy failed');expect(host.querySelector('button')?.textContent).toBe('Copy');
});
it('ignores stale clipboard completion when the copied value changes',async()=>{
 let finish:()=>void=()=>undefined;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise<void>(resolve=>{finish=resolve;})}});const confirmed=vi.fn();await act(async()=>root.render(<CopyButton value="old" onCopied={confirmed}/>));await act(async()=>host.querySelector('button')!.click());await act(async()=>root.render(<CopyButton value="new" onCopied={confirmed}/>));await act(async()=>finish());expect(confirmed).not.toHaveBeenCalled();expect(host.querySelector('button')?.textContent).toBe('Copy');
});
it('uses only actual room kinds for atmosphere and falls back neutrally',()=>{
 expect(roomAtmosphere({room_type:'private',room_kind:'guest'})).toBe('violet');expect(roomAtmosphere({room_type:'group'})).toBe('blue');expect(roomAtmosphere({room_kind:'public'})).toBe('blue');expect(roomAtmosphere({room_kind:'direct'})).toBe('fading');expect(roomAtmosphere({room_kind:'match'})).toBe('monochrome');expect(roomAtmosphere({room_type:'private',room_kind:'made-up-ghost'})).toBe('neutral');expect(roomAtmosphere({})).toBe('neutral');
});
it('handles missing, invalid, non-expiring and expired timestamps without invented progress',()=>{
 expect(expiryInfo().state).toBe('unavailable');expect(expiryInfo('invalid').label).toBe('Expiry unavailable');expect(expiryInfo(null).state).toBe('unscheduled');expect(expiryInfo('2026-10-12T00:00:00Z',undefined,Date.parse('2026-10-12T01:00:00Z')).state).toBe('expired');const now=Date.parse('2026-10-12T00:30:00Z');expect(expiryInfo('2026-10-12T01:00:00Z',undefined,now).fraction).toBeUndefined();expect(expiryInfo('2026-10-12T01:00:00Z','2026-10-12T00:00:00Z',now).fraction).toBe(.5);expect(expiryInfo('2026-10-12T01:00:00Z','2026-10-12T02:00:00Z',now).fraction).toBeUndefined();
});
it('renders rings only with authorized timing data, updates expiry and avoids live countdown announcements',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-12T00:00:00Z'));await act(async()=>root.render(<ExpiryCountdown expiresAt="2026-10-12T00:00:02Z"/>));expect(host.querySelector('circle[pathLength="100"]')).toBeNull();expect(host.textContent).toContain('00:00:02');await act(async()=>root.render(<ExpiryCountdown expiresAt="2026-10-12T00:00:02Z" createdAt="2026-10-11T23:59:00Z"/>));expect(host.querySelector('circle[pathLength="100"]')).not.toBeNull();expect(host.querySelector('[aria-live]')?.getAttribute('aria-live')).toBe('off');await act(async()=>vi.advanceTimersByTimeAsync(2000));expect(host.textContent).toContain('Expired');await act(async()=>root.render(<ExpiryCountdown expiresAt={null}/>));expect(host.textContent).toContain('No scheduled expiry');
});
it('omits unavailable/unauthorized member and message metadata from real room cards',()=>{
 const room={code:'ROOM0001',room_name:'Room',room_type:'private',expires_at:'invalid',last_message:'private evidence',participants:999};const markup=renderToStaticMarkup(<RoomCard room={room} open={()=>undefined}/>);expect(markup).toContain('Private room');expect(markup).not.toContain('999');expect(markup).not.toContain('private evidence');expect(markup).not.toContain('<time');
});
it('prevents duplicate active cards without fabricating category counts',async()=>{
 const room={code:'ROOM0001',room_name:'Room',room_type:'private' as const,expires_at:'2026-10-13T00:00:00Z'};await act(async()=>root.render(<ActiveRoomsSection rooms={[room,room]} loading={false} error="" refresh={async()=>undefined} openRoom={()=>undefined} createRoom={()=>undefined}/>));expect(host.querySelectorAll('.space-room').length).toBe(1);expect(host.querySelector('.space-category--private .space-category__count')?.textContent).toBe('1');
});
it('keeps toggle native keyboard/form semantics and existing change handlers',async()=>{
 const change=vi.fn();await act(async()=>root.render(<form><ToggleSwitch name="ghost_mode" label="Prefer Ghost Mode" defaultChecked onChange={change}/></form>));const input=host.querySelector('input')!;expect(new FormData(host.querySelector('form')!).get('ghost_mode')).toBe('on');await act(async()=>input.click());expect(change).toHaveBeenCalledOnce();expect(input.checked).toBe(false);expect(new FormData(host.querySelector('form')!).has('ghost_mode')).toBe(false);expect(host.querySelector('.toggle-switch__track')?.getAttribute('aria-hidden')).toBe('true');
});
it('keeps kinetic text semantic and privacy claims understandable without motion',async()=>{
 const heading=renderToStaticMarkup(<KineticHeadline/>);expect(heading).toContain('<h1');expect((heading.match(/kinetic-word/g)||[]).length).toBe(4);await act(async()=>root.render(<PrivacyJourney/>));expect(host.querySelectorAll('li').length).toBe(4);await act(async()=>host.querySelectorAll<HTMLButtonElement>('button')[3].click());expect(host.querySelector('[role="status"]')?.textContent).toContain('cleanup may continue afterward');expect(css).toContain('@media(prefers-reduced-motion:reduce)');
});
it('provides branded inline/button/page loaders without exposing vector shapes to screen readers',()=>{
 for(const variant of ['inline','button','page'] as const){const html=renderToStaticMarkup(<LoadingSignal label="Loading rooms" variant={variant}/>);expect(html).toContain(`loading-signal--${variant}`);expect(html).toContain('aria-hidden="true"');expect(html).toContain('Loading rooms');}
});
it('does not show creation success for ordinary chat navigation',async()=>{await act(async()=>root.render(<MemoryRouter initialEntries={['/chat/ROOM0001']}><RoomCreatedFeedback/></MemoryRouter>));expect(host.querySelector('.room-created-feedback')).toBeNull();});
async function createFixture(){await act(async()=>root.render(<ThemeProvider><MemoryRouter><RoomCreatedFeedback/><Routes><Route path="/" element={<LandingPage/>}/><Route path="/chat/:code" element={<p>Chat destination</p>}/></Routes></MemoryRouter></ThemeProvider>));const create=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Create Private')!;await act(async()=>create.click());for(const [label,value] of [['Your display name','Fixture'],['Room name','Fixture room']]){const input=document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}const submit=[...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(button=>button.textContent==='Create')!;await act(async()=>submit.click());}
it('navigates without delay and shows success only after confirmed creation',async()=>{post.mockResolvedValue({data:{data:{code:'ROOM0001'}}});await createFixture();expect(post).toHaveBeenCalledOnce();expect(host.textContent).toContain('Chat destination');expect(host.querySelector('.room-created-feedback')?.textContent).toBe('Room created');});
it('keeps failed creation on its error form without showing success',async()=>{post.mockRejectedValue(new Error('network'));await createFixture();expect(post).toHaveBeenCalledOnce();expect(host.querySelector('.room-created-feedback')).toBeNull();expect(document.querySelector('#create-channel-title')?.closest('dialog')?.textContent).toContain('Unable to create room');});
it('does not claim creation success for a response missing its room code',async()=>{post.mockResolvedValue({data:{data:{}}});await createFixture();expect(host.querySelector('.room-created-feedback')).toBeNull();expect(document.querySelector('#create-channel-title')?.closest('dialog')?.textContent).toContain('Unable to create room');expect(host.textContent).not.toContain('Chat destination');});
