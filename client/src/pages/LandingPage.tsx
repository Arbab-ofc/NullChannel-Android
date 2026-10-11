import { Modal } from '../components/common/Modal';
import { TimerReset, UserCheck, MessageCircle, Radio, ArrowRight, Fingerprint, Users, LockKeyhole } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    setActiveRoomsLoading(true);
    api.get(`/users/${senderId}/rooms`)
      .then((res) => setActiveRooms(res.data.data ?? []))
      .catch(() => setActiveRooms([]))
      .finally(() => setActiveRoomsLoading(false));
  }, [senderId]);

  const grouped = useMemo(() => ({
    private: activeRooms.filter((r) => (r.room_type ?? 'private') === 'private').slice(0, 6),
    group: activeRooms.filter((r) => (r.room_type ?? 'private') === 'group').slice(0, 6)
  }), [activeRooms]);

  return <main className="min-h-screen bg-bg px-3 py-4 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="neo-panel flex items-center justify-between gap-4 px-5 py-4 xl:max-w-7xl xl:gap-3 xl:px-4">
        <div>
          <p className="code-font text-xs tracking-[0.3em] text-cyan">NULLCHANNEL / PRIVATE RELAY</p>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-wide">NullChannel</h1>
        </div>
        <div className="hidden items-center gap-2 xl:flex">
          <Link className="whitespace-nowrap text-sm" to="/features">Features</Link><a className="whitespace-nowrap text-sm" href="#how-it-works">How It Works</a><Link className="whitespace-nowrap text-sm" to="/explore">Explore</Link><Link className="whitespace-nowrap text-sm" to="/docs">Docs</Link><Link className="whitespace-nowrap text-sm" to="/login">Login</Link><Link to="/signup" className="whitespace-nowrap text-sm text-cyan">Sign Up</Link><ThemeToggle />
          <Button className="whitespace-nowrap px-3 text-xs" onClick={() => setCreateType('private')}>Create Private</Button>
          <Button className="whitespace-nowrap px-3 text-xs" onClick={() => setCreateType('group')}>Create Group</Button>
        </div>
        <button
          className="neo-action inline-flex h-11 w-11 items-center justify-center border-2 border-accent bg-panel xl:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          aria-controls="public-navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>
      <NavigationOverlay id="public-navigation" title="Navigation" open={menuOpen} close={closeMenu} immediate={createType !== null}>
        <section className="command-group"><h3>Discover</h3><div><Link to="/features">Features</Link><a href="#how-it-works" onClick={closeMenu}>How It Works</a><Link to="/explore">Explore</Link><Link to="/docs">Documentation</Link><Link to="/login">Login</Link><Link to="/signup">Sign Up</Link></div></section>
        <section className="command-group"><h3>Appearance</h3><div><ThemeToggle /></div></section>
        <section className="command-group"><h3>Channels</h3><div>
          <Button onClick={() => { closeMenu(); setCreateType('private'); }}>Create Private</Button>
          <Button onClick={() => { closeMenu(); setCreateType('group'); }}>Create Group</Button>
        </div></section>
      </NavigationOverlay>

      <section className="hero-transmission home-hero relative overflow-hidden p-5 sm:p-8 lg:p-10">
        <div className="hero-signal-band" aria-hidden="true" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <p className="code-font text-xs tracking-[0.25em] text-cyan">CONNECT PERMANENTLY. CONVERSE TEMPORARILY.</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black uppercase leading-tight sm:text-6xl">Connect Permanently.<br /><span className="text-cyan">Converse Temporarily.</span></h2>
            <p className="mt-4 max-w-3xl text-base text-muted sm:text-lg">Build meaningful connections, start private conversations, and let every chat disappear when its session ends.</p>
          </div>
          <div className="grid gap-3">
            <Link to="/signup" className="home-primary">Get Started <ArrowRight aria-hidden="true" /></Link><a href="#anonymous" className="home-secondary">Continue Anonymously</a>
            <button className="hero-mode-card neo-action border-2 border-cyan bg-cyan/10 p-4 text-left" onClick={() => setCreateType('private')}>
              <span className="flex items-center justify-between gap-3">
                <span>
                  <span className="code-font text-[10px] uppercase tracking-[0.22em] text-cyan">Private Room</span>
                  <span className="mt-1 block text-lg font-black uppercase">1:1 channel</span>
                </span>
                <LockKeyhole className="h-6 w-6 text-punch" />
              </span>
              <span className="mt-3 block text-xs uppercase tracking-wider text-muted">Limited to two active users.</span>
            </button>
            <button className="hero-mode-card neo-action border-2 border-punch bg-punch/10 p-4 text-left" onClick={() => setCreateType('group')}>
              <span className="flex items-center justify-between gap-3">
                <span>
                  <span className="code-font text-[10px] uppercase tracking-[0.22em] text-punch">Group Room</span>
                  <span className="mt-1 block text-lg font-black uppercase">Squad relay</span>
                </span>
                <Users className="h-6 w-6 text-cyan" />
              </span>
              <span className="mt-3 block text-xs uppercase tracking-wider text-muted">Names required for multi-user chat.</span>
            </button>
          </div>
        </div>
        <div id="anonymous" className="mt-8 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
          <input
            aria-label="Eight-character room code" value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 8))}
            placeholder="ENTER 8-CHAR CODE"
            className="h-12 w-full rounded-none border-2 border-accent bg-bg px-4 text-sm font-semibold tracking-widest text-text outline-none placeholder:text-muted focus:border-cyan"
            onKeyDown={(e) => {
              if (e.key === 'Enter') joinChannel();
            }}
          />
          <Button className="h-12 w-full lg:w-auto" onClick={joinChannel} disabled={joinCode.trim().length !== 8}>Join Channel</Button>
          <Button className="h-12 bg-accent text-bg" onClick={() => setCreateType('private')}>Create Private</Button>
          <Button className="h-12 border-punch text-punch" onClick={() => setCreateType('group')}>Create Group</Button>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-wider text-muted">
          <span className="border border-cyan px-3 py-1">No signup</span>
          <span className="border border-cyan px-3 py-1">15 min to 24 hour expiry</span>
          <span className="border border-cyan px-3 py-1">Real-time transport</span>
          <span className="border border-punch px-3 py-1">Private + group modes</span>
        </div>
      </section>

      <section id="features" className="home-section">
        <p className="code-font text-xs tracking-widest text-cyan">ONE PRINCIPLE. TWO WAYS TO CONNECT.</p>
        <div className="home-modes">
          <article><UserCheck aria-hidden="true" /><h2>Anonymous Mode</h2><h3>No account. Just a conversation.</h3><p>Instant access to temporary, invite-based rooms. No registration required.</p><Button onClick={() => setCreateType('private')}>Start anonymously</Button></article>
          <article><Users aria-hidden="true" /><h2>Registered Mode</h2><h3>Keep your friends. Lose the history.</h3><p>A persistent profile and friendships, with a fresh temporary session for every conversation.</p><Link to="/signup" className="home-secondary">Create an account <ArrowRight aria-hidden="true" /></Link></article>
        </div>
      </section>
      <section id="how-it-works" className="home-section">
        <p className="code-font text-xs tracking-widest text-cyan">HOW IT WORKS</p><h2>A conversation, with an ending.</h2>
        <ol className="home-steps">{['Choose your mode.', 'Find or invite someone.', 'Start a temporary conversation.', 'End the session.', 'The conversation disappears from the application.'].map((step, index) => <li key={step}><span className="code-font text-cyan">0{index + 1}</span><p>{step}</p></li>)}</ol>
      </section>
      <section className="home-section">
        <p className="code-font text-xs tracking-widest text-cyan">BUILT INTO THE CHANNEL</p><h2>Less history. More control.</h2>
        <div className="home-feature-list">{[{Icon: MessageCircle, title:'Temporary rooms', text:'Invite someone into a private room or bring a group together. Every room has a finite lifetime.'}, {Icon: TimerReset, title:'Burn Mode', text:'A message disappears 60 seconds after another participant sees it.'}, {Icon: Fingerprint, title:'Session identities', text:'Guest aliases belong to the conversation. Account identities stay separate from anonymous chat.'}, {Icon: LockKeyhole, title:'Voice and media', text:'Talk one-to-one and share images, voice notes and files. Provider cleanup may take time after a session ends.'}].map(({Icon,title,text}) => <article key={title}><Icon aria-hidden="true" /><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      </section>
      <section className="home-section home-modes">
        <article><p className="code-font text-xs tracking-widest text-cyan">PERSISTENT</p><h2>Connections stay.</h2><p>Accounts, friendships and privacy settings are independent of chat sessions.</p></article>
        <article><p className="code-font text-xs tracking-widest text-punch">TEMPORARY</p><h2>Conversations end.</h2><p>Rooms, messages, attachments, calls and room invitations expire. There is no chat restoration.</p></article>
      </section>
      <section className="home-section"><h2>Choose your connection.</h2><div className="overflow-x-auto"><table className="home-comparison"><caption className="sr-only">Guest and registered features</caption><thead><tr><th scope="col">Feature</th><th scope="col">Guest</th><th scope="col">Registered</th></tr></thead><tbody>{[['Temporary conversations','Yes','Yes'],['Account required','No','Yes'],['Persistent friendships','No','Yes'],['Public discovery','No','Yes'],['Anonymous matching','No','Yes'],['Restore expired chats','Never','Never']].map(row => <tr key={row[0]}>{row.map((cell,i) => i===0 ? <th scope="row" key={cell}>{cell}</th> : <td key={i}>{cell}</td>)}</tr>)}</tbody></table></div></section>
      <section className="home-section"><h2>Before you connect.</h2><div className="home-faq">{[
        ['Is registration required?','No. Continue anonymously to create or join a guest room.'],
        ['Can I add friends?','Registered accounts can keep friendships between temporary conversations.'],
        ['Are messages permanent?','No. Session expiry revokes application access and starts cleanup. Burn messages expire 60 seconds after being seen.'],
        ['Do groups remain?','Groups expire or can be destroyed. Create a new group for your next conversation.'],
        ['Can I recover deleted chats?','No. NullChannel has no chat restoration feature.'],
        ['How does random matching work?','Registered users search for an available participant. Both must accept a proposal before a room is created.'],
        ['What happens after 60 seconds?','The server ends an unmatched search. You can try again later.'],
        ['Can I remain anonymous?','Yes. Random sessions begin with temporary aliases.'],
        ['Can I reveal my identity?','Only mutual, session-specific consent can reveal permitted profile information.'],
        ['Does ending a room remove my friends?','No. Friendship persists. Conversations do not.']
      ].map(([question,answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
      <section className="home-section home-final"><Radio aria-hidden="true" /><h2>Start a conversation.<br />Leave no chat history behind.</h2><div className="flex flex-wrap gap-4"><Link to="/signup" className="home-primary">Get Started <ArrowRight aria-hidden="true" /></Link><Button onClick={() => setCreateType('private')}>Continue Anonymously</Button></div></section>

      <section className="neo-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="code-font text-xs tracking-[0.2em] text-cyan">YOUR ACTIVE ROOMS</p>
          {activeRoomsLoading && <LoadingSignal label="Syncing rooms" className="code-font text-xs uppercase tracking-[0.16em] text-muted" />}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-bold uppercase">Active Private</h3>
            <div className="mt-2 space-y-2">
              {activeRoomsLoading && <RoomLoadingRows />}
              {!activeRoomsLoading && grouped.private.length === 0 && <p className="text-xs text-muted">No active private rooms.</p>}
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
              {!activeRoomsLoading && grouped.group.length === 0 && <p className="text-xs text-muted">No active group rooms.</p>}
              {grouped.group.map((r) => (
                <button key={`g-${r.code}`} className="neo-action w-full border-2 border-accent/60 px-3 py-2 text-left" onClick={() => nav(`/chat/${r.code}`)}>
                  <p className="code-font text-sm tracking-widest">{r.code}</p>
                  <p className="text-xs text-muted">{r.room_name} • Active</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
    {createType && (
      <Modal titleId="create-channel-title" close={() => { if (!createBusy) setCreateType(null); }}>
        <div className="neo-panel w-full max-w-md p-5">
          <p className="code-font text-xs tracking-[0.2em] text-cyan">CREATE {createType.toUpperCase()} ROOM</p>
          <h3 id="create-channel-title" className="mt-2 text-xl font-bold uppercase">Configure Channel</h3>
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
          {!!createError && <p className="mt-3 border-2 border-red-400 bg-panel px-3 py-2 text-xs uppercase tracking-wider text-red-300">{createError}</p>}
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
