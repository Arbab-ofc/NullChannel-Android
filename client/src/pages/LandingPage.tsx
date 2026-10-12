import { PullToRefresh } from '../components/mobile/PullToRefresh';
import { EmptyState } from '../components/common/EmptyState';
import { Brand } from '../components/common/Brand';
import { SignalArt } from '../components/common/SignalArt';
import { ProductPreview } from '../components/common/ProductPreview';
import '../styles/landing.css';
import { Modal } from '../components/common/Modal';
import { TimerReset, UserCheck, MessageCircle, Radio, ArrowRight, Fingerprint, Users, LockKeyhole, ArrowUpRight, Sparkles, Zap, ShieldCheck, Mic } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { NavigationOverlay } from '../components/common/NavigationOverlay';
import { Button } from '../components/common/Button';
import { api } from '../lib/api';
import { useLocalSender } from '../hooks/useLocalSender';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { LoadingSignal } from '../components/common/LoadingSignal';

const expiryOptions = [
  { label: '15 Min', value: 15 },
  { label: '1 Hour', value: 60 },
  { label: '6 Hours', value: 360 },
  { label: '24 Hours', value: 1440 }
] as const;

export default function LandingPage() {
  const nav = useNavigate();
  const senderId = useLocalSender();
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [expiresInMinutes, setExpiresInMinutes] = useState<(typeof expiryOptions)[number]['value']>(1440);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false),[]);
  const [createType, setCreateType] = useState<'private' | 'group' | null>(null);
  const [createBusy, setCreateBusy] = useState<'private' | 'group' | null>(null);
  const [createError, setCreateError] = useState('');
  const [activeRoomsError,setActiveRoomsError]=useState('');
  const [activeRoomsLoading, setActiveRoomsLoading] = useState(true);
  const [activeRooms, setActiveRooms] = useState<Array<{ code: string; room_name: string; room_type: 'private' | 'group'; expires_at: string }>>([]);

  const joinChannel = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 8) return;
    nav(`/chat/${code}`);
  };

  const createChannel = async (roomType: 'private' | 'group') => {
    const name = roomName.trim();
    const displayName = creatorName.trim();
    if (name.length < 2 || displayName.length < 2 || createBusy) return;
    setCreateBusy(roomType);
    setCreateError('');
    try {
      const res = await api.post('/rooms', { senderId, senderName: displayName, roomType, roomName: name, expiresInMinutes });
      sessionStorage.setItem(`nullchannel_name_${res.data.data.code}`, displayName);
      setCreateType(null);
      setRoomName('');
      setCreatorName('');
      setExpiresInMinutes(1440);
      nav(`/chat/${res.data.data.code}`);
    } catch {
      setCreateError('Unable to create room. Try again.');
    } finally {
      setCreateBusy(null);
    }
  };

  const roomRequest=useRef<Promise<void>|null>(null);
  const refreshRooms=useCallback(()=>{
    if(roomRequest.current)return roomRequest.current;
    setActiveRoomsLoading(true);setActiveRoomsError('');
    const request=api.get(`/users/${senderId}/rooms`).then(res=>setActiveRooms(res.data.data??[])).catch(()=>setActiveRoomsError('Unable to load your rooms. Use Refresh to try again.')).finally(()=>{setActiveRoomsLoading(false);roomRequest.current=null;});roomRequest.current=request;return request;
  },[senderId]);
  useEffect(()=>{void refreshRooms();},[refreshRooms]);

  useEffect(()=>{
    if (typeof IntersectionObserver==='undefined'||window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}}),{threshold:.05});
    const sections=document.querySelectorAll('.landing-page [data-reveal]');
    sections.forEach(section=>{section.classList.add('will-reveal');observer.observe(section);});
    return()=>{observer.disconnect();sections.forEach(section=>section.classList.remove('will-reveal'));};
  },[]);

  const grouped = useMemo(() => ({
    private: activeRooms.filter((r) => (r.room_type ?? 'private') === 'private').slice(0, 6),
    group: activeRooms.filter((r) => (r.room_type ?? 'private') === 'group').slice(0, 6)
  }), [activeRooms]);

  return <main className="landing-page">
    <div className="landing-container">
      <header className="landing-header">
        <Link to="/" aria-label="NullChannel home"><Brand /></Link>
        <nav className="landing-nav" aria-label="Main navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><Link to="/explore">Explore</Link><Link to="/docs">Docs</Link></nav>
        <div className="landing-header__actions"><ThemeToggle/><Link to="/login" className="landing-login">Log in</Link><Link to="/signup" className="nc-button nc-button--primary landing-signup">Get started <ArrowUpRight aria-hidden="true" size={16}/></Link><button className="landing-menu nc-button nc-button--secondary" aria-label="Toggle menu" aria-expanded={menuOpen} aria-controls="public-navigation" onClick={()=>setMenuOpen(value=>!value)}><Menu aria-hidden="true" size={20}/></button></div>
      </header>
      <NavigationOverlay desktopBreakpoint={1024} id="public-navigation" title="Make yourself at home." open={menuOpen} close={closeMenu} immediate={createType !== null}>
        <section className="command-group"><h3>Discover</h3><div><a href="#features" onClick={closeMenu}>Features</a><a href="#how-it-works" onClick={closeMenu}>How it works</a><Link to="/explore">Explore</Link><Link to="/docs">Documentation</Link><Link to="/login">Login</Link><Link to="/signup">Sign Up</Link></div></section>
        <section className="command-group"><h3>Your next conversation</h3><div><Button onClick={()=>{closeMenu();setCreateType('private');}}>Create Private</Button><Button onClick={()=>{closeMenu();setCreateType('group');}}>Create Group</Button></div></section>
      </NavigationOverlay>
    </div>
    <section className="landing-hero">
      <div className="landing-container hero-composition">
        <div className="hero-copy">
          <p className="nc-eyebrow">A space for the here and now</p>
          <h1>Connect permanently.<br/><span>Converse temporarily.</span></h1>
          <p className="hero-description">Keep the people. Leave the history.<br/>Real connections, in conversations made to disappear.</p>
          <div className="hero-actions"><Link to="/signup" className="nc-button nc-button--primary">Get Started <ArrowUpRight aria-hidden="true"/></Link><Button variant="ghost" onClick={()=>setCreateType('private')}>Continue Anonymously <ArrowRight aria-hidden="true"/></Button></div>
          <div className="hero-footnote"><span className="signal-dot"/> No account needed to start a guest room.</div>
        </div>
        <div className="hero-visual"><SignalArt/><div className="hero-sticker" aria-hidden="true"><Sparkles size={16}/> here, then gone.</div><ProductPreview/></div>
      </div>
    </section>
    <div className="landing-container">
      <section id="anonymous" className="guest-entry" aria-labelledby="guest-entry-title">
        <div><p className="nc-eyebrow">Your room. Your moment.</p><h2 id="guest-entry-title">Skip the sign-up.</h2><p>Make a private room, bring your people, or join with a code.</p></div>
        <div className="guest-entry__controls"><div className="guest-create"><Button variant="primary" onClick={()=>setCreateType('private')}><LockKeyhole aria-hidden="true"/>Create Private</Button><Button onClick={()=>setCreateType('group')}><Users aria-hidden="true"/>Create Group</Button></div><form className="guest-join" onSubmit={event=>{event.preventDefault();joinChannel();}}><label className="sr-only" htmlFor="guest-room-code">Eight-character room code</label><input id="guest-room-code" value={joinCode} onChange={event=>setJoinCode(event.target.value.toUpperCase().slice(0,8))} maxLength={8} placeholder="8-character room code" autoComplete="off"/><Button type="submit" disabled={joinCode.trim().length!==8}>Join Channel <ArrowRight aria-hidden="true"/></Button></form></div>
      </section>
      <section id="features" className="landing-section" data-reveal>
        <div className="section-heading"><div><p className="nc-eyebrow">Less baggage. More connection.</p><h2>All the ways to be here.</h2></div><p>A familiar chat experience,<br/>with a different relationship to time.</p></div>
        <div className="feature-bento">
          <article className="feature-bento__lead"><SignalArt/><Users aria-hidden="true"/><span className="feature-tag">Your people</span><h3>Keep your friends.<br/>Lose the history.</h3><p>Your account and friendships stay. Each conversation starts fresh.</p><Link to="/signup">Create an account <ArrowUpRight aria-hidden="true" size={18}/></Link></article>
          <article><TimerReset aria-hidden="true"/><h3>A conversation with an ending.</h3><p>Finite room lifetimes, timed messages and Burn Mode: 60 seconds after another participant sees it.</p><span className="feature-detail">Temporary by design</span></article>
          <article><Fingerprint aria-hidden="true"/><h3>Meet as a ghost.</h3><p>Random matching starts with a session alias. Profile reveal and staying connected need mutual consent.</p><Link to="/match">Find someone <ArrowUpRight aria-hidden="true" size={18}/></Link></article>
          <article><Mic aria-hidden="true"/><h3>More than words.</h3><p>One-to-one voice calls, voice notes, images and files. The conversation stays temporary.</p><span className="feature-detail">Talk. Share. Be here.</span></article>
          <article><Radio aria-hidden="true"/><h3>Find your frequency.</h3><p>Discover public rooms or make a private group. Every room has a finite lifetime.</p><Link to="/explore">Explore rooms <ArrowUpRight aria-hidden="true" size={18}/></Link></article>
        </div>
      </section>
      <section id="how-it-works" className="landing-section"><div className="section-heading"><div><p className="nc-eyebrow">No complicated introductions</p><h2>A little hello goes a long way.</h2></div></div><ol className="journey-steps">{[{Icon:UserCheck,title:'Choose your mode.',text:'Drop in as a guest, or keep your connections with an account.'},{Icon:MessageCircle,title:'Find your people.',text:'Invite a friend, explore a room, or meet someone anonymously.'},{Icon:Zap,title:'Be in the moment.',text:'Talk, share and connect. When the session ends, access ends too.'}].map(({Icon,title,text},index)=><li key={title}><div><span>0{index+1}</span><Icon aria-hidden="true"/></div><h3>{title}</h3><p>{text}</p></li>)}</ol></section>
      <section className="privacy-story landing-section"><div><p className="nc-eyebrow">Built around a simple principle</p><h2>Friendship persists.<br/><span>Conversations don’t.</span></h2><p>Accounts, friends and settings can stay. Rooms, messages, attachments and session identities expire. There’s no chat restoration.</p><p className="privacy-story__note">Access ends immediately at expiry. Server cleanup and external media deletion may take time. Screenshots and downloaded copies remain outside our control.</p><Link to="/docs#privacy">Read how privacy works <ArrowUpRight aria-hidden="true" size={18}/></Link></div><div className="privacy-manifest"><ShieldCheck aria-hidden="true"/><div><span>Keep</span><p>People. Preferences. Your profile.</p></div><div><span>Let go</span><p>Rooms. Messages. The conversation.</p></div><p>No recovery button. No permanent threads.</p></div></section>
      <section className="landing-section landing-faq"><div><p className="nc-eyebrow">Good questions</p><h2>Before you say hello.</h2></div><div>{[
        ['Is registration required?','No. Continue anonymously to create or join a guest room.'],
        ['Can I keep my friends?','Yes. Registered accounts keep friendships independently of temporary chats.'],
        ['Can I recover an expired conversation?','No. Rooms and groups expire or are destroyed. There is no chat restoration.'],
        ['How does random matching work?','Registered users search for up to 60 seconds. Both people must accept a separate proposal before a temporary room is created. If nobody is available, you can try again later.'],
        ['Can I reveal my identity?','Random sessions begin with temporary aliases. Only mutual consent in that session reveals permitted profile information.'],
        ['Does ending a room remove my friends?','No. Friendship persists. Conversations do not.']
      ].map(([question,answer])=><details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="landing-final"><span className="nc-eyebrow">Some moments don’t need a history</span><h2>Stay connected.<br/><span>Travel light.</span></h2><div className="hero-actions"><Link to="/signup" className="nc-button nc-button--primary">Get Started <ArrowUpRight aria-hidden="true"/></Link><Button onClick={()=>setCreateType('private')}>Start anonymously</Button></div><SignalArt/></section>
      <PullToRefresh refresh={refreshRooms}><section className="neo-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="code-font text-xs tracking-[0.2em] text-cyan">YOUR ACTIVE ROOMS</p>
          {activeRoomsError && <p role="alert">{activeRoomsError}</p>}
          {activeRoomsLoading && <LoadingSignal label="Syncing rooms" className="code-font text-xs uppercase tracking-[0.16em] text-muted" />}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-bold uppercase">Active Private</h3>
            <div className="mt-2 space-y-2">
              {activeRoomsLoading && <RoomLoadingRows />}
              {!activeRoomsLoading && !activeRoomsError && grouped.private.length === 0 && <EmptyState title="Your space is waiting." description="Create a private room to get started."/>}
              {grouped.private.map((r) => (
                <button key={`p-${r.code}`} className="neo-action w-full border-2 border-accent/60 px-3 py-2 text-left" onClick={() => nav(`/chat/${r.code}`)}>
                  <p className="code-font text-sm tracking-widest">{r.code}</p>
                  <p className="text-xs text-muted">{r.room_name} • Active</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase">Active Groups</h3>
            <div className="mt-2 space-y-2">
              {activeRoomsLoading && <RoomLoadingRows />}
              {!activeRoomsLoading && !activeRoomsError && grouped.group.length === 0 && <EmptyState title="Make room for your people." description="Create a temporary group to get started."/>}
              {grouped.group.map((r) => (
                <button key={`g-${r.code}`} className="neo-action w-full border-2 border-accent/60 px-3 py-2 text-left" onClick={() => nav(`/chat/${r.code}`)}>
                  <p className="code-font text-sm tracking-widest">{r.code}</p>
                  <p className="text-xs text-muted">{r.room_name} • Active</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section></PullToRefresh>
    </div>
    {createType && (
      <Modal titleId="create-channel-title" close={() => { if (!createBusy) setCreateType(null); }}>
        <div className="neo-panel w-full max-w-md p-5">
          <p className="code-font text-xs tracking-[0.2em] text-cyan">CREATE {createType.toUpperCase()} ROOM</p>
          <h3 id="create-channel-title" className="mt-2 text-2xl font-bold">Make room for a conversation.</h3>
          <input
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            aria-label="Your display name" placeholder="Your display name"
            className="mt-4 h-11 w-full border-2 border-accent bg-bg px-3 text-sm"
            maxLength={24}
            disabled={!!createBusy}
            autoFocus
          />
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            aria-label="Room name" placeholder="Room name"
            className="mt-4 h-11 w-full border-2 border-accent bg-bg px-3 text-sm"
            maxLength={40}
            disabled={!!createBusy}
          />
          <p className="mt-2 text-xs text-muted">Names need at least 2 characters.</p>
          <div className="mt-4">
            <p className="code-font text-[10px] uppercase tracking-[0.2em] text-muted">Auto Expire After</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {expiryOptions.map((option) => (
                <button
                  key={option.value}
                  aria-pressed={expiresInMinutes === option.value}
                  className={`neo-action border-2 px-2 py-2 text-xs font-bold uppercase tracking-wider ${expiresInMinutes === option.value ? 'border-cyan bg-cyan/10 text-cyan' : 'border-accent bg-panel text-muted'}`}
                  onClick={() => setExpiresInMinutes(option.value)}
                  disabled={!!createBusy}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => { setCreateType(null); setRoomName(''); setCreatorName(''); setExpiresInMinutes(1440); setCreateError(''); }} disabled={!!createBusy}>Cancel</Button>
            <Button className="bg-accent text-bg" onClick={() => createChannel(createType)} disabled={roomName.trim().length < 2 || creatorName.trim().length < 2 || !!createBusy}>
              {createBusy === createType ? <LoadingSignal label="Creating" /> : 'Create'}
            </Button>
          </div>
          {!!createError && <p role="alert" className="mt-3 border-2 border-punch bg-panel px-3 py-2 text-xs text-punch">{createError}</p>}
        </div>
      </Modal>
    )}
  </main>;
}

const RoomLoadingRows = () => (
  <>
    <div className="loading-row h-[58px]" />
    <div className="loading-row h-[58px]" />
  </>
);
