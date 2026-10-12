import { Brand } from '../components/common/Brand';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ThemeToggle} from '../components/common/ThemeToggle';
import {EndpointReference,type Endpoint} from '../components/common/EndpointReference';

const topics:Record<string,string>={
 Introduction:'Connect Permanently. Converse Temporarily. Accounts and friendships persist; conversations expire.',
 'Getting Started':'Continue anonymously to create or join an eight-character room. Registered accounts add friends, discovery and matching.',
 Authentication:'Guest cookies authenticate anonymous sessions. Registered cookies contain verified Supabase Auth credentials and are HttpOnly. Write requests require the configured Origin header.',
 'Anonymous Sessions':'Guest access lasts 15 minutes and renews through a 30-day refresh session. Lost refresh credentials never recover old ownership.',
 'Registered Users':'Sign up with a unique username, email and a 12-character password. Email verification follows the configured Supabase project policy.',
 Profiles:'Usernames are unique ignoring case. Changes have a 30-day cooldown. Public profile APIs omit email and authentication tokens.',
 Friends:'Requests expire after seven days by default. Acceptance creates a persistent relationship independent of temporary rooms. Blocking removes friendships and requests.',
 Presence:'Online, away and invisible status uses authenticated Socket.IO connections and heartbeat leases. Multiple tabs remain online until their qualifying connections end. Visibility is privacy-filtered.',
 Rooms:'All rooms have finite lifetimes. Existing guest private/group rooms remain supported. Every registered conversation uses fresh session-scoped sender identifiers.',
 'Public Discovery':'Only registered users can discover public rooms. Search, category filtering, expiry sorting and pagination exclude private rooms.',
 'Private Groups':'Private groups use ephemeral membership, owner roles and friend invitations. Group audio conferencing is not currently supported.',
 Invitations:'Friend invitations expire before a room is created. Mutual acceptance creates a fresh direct room. Expired invitations are rejected by database deadlines.',
 Messages:'Text, replies, reactions, editing, deletion, pinning and panic wipe use membership authorization. Burn Mode starts a 60-second deadline after a recipient sees a message. Optional timed messages expire 60–86400 seconds after creation; the earlier message, burn or room deadline always wins.',
 Media:'Images, voice notes and files require room membership, size/type/signature validation. New media uses a protected proxy. View-once attachments require an explicit opening and permit one recipient delivery. Provider deletion uses durable retries. Legacy public URLs can remain accessible until provider deletion; screenshots and downloaded copies cannot be prevented.',
 'Voice Calls':'One-to-one audio uses WebRTC and authenticated Socket.IO signaling in private rooms. Room termination stops signaling and calls. STUN-only connections may fail on restrictive networks.',
 Matchmaking:'Registered searches have a database-recorded 60-second deadline. A candidate proposal has a separate 15-second acceptance window. A room is created only after both accept.',
 'Ghost Mode':'Matched participants start with room-scoped aliases. Account UUIDs and profile details are absent from room membership/message payloads.',
 'Identity Reveal':'Consent belongs to the current room. Unilateral or rejected consent returns no profile. Mutual connection consent creates friendship independently of chat data.',
 Notifications:'Offline friend notifications contain no message body. Authenticated sockets deliver social/invitation/match events. Notification preferences are stored in Supabase.',
 Privacy:'Profile discovery, friend requests, presence, invitations and matching use server-enforced preferences. Browser copies and screenshots are outside server-controlled deletion.',
 'Session Destruction':'Expiry rejects access before cleanup. Database records cascade; provider file IDs remain in retry jobs until deletion succeeds. No restoration endpoint exists.',
 'Socket.IO Events':'Guest: join-room, leave-room, send-message, typing. Registered: presence:heartbeat, presence:set. Server: presence:update, friend:request, friend:accepted, friend:updated, invitation:received, match:status, notifications:update, directory:updated, poll:update and existing room/call events. Sensitive events validate credentials and membership.',
 'Error Codes':'VALIDATION_ERROR (400), ACCOUNT_REQUIRED or SESSION_EXPIRED (401), FORBIDDEN or CSRF_REJECTED (403), ROOM_NOT_FOUND (404), REQUEST_UNAVAILABLE (409), RATE_LIMITED (429), INTERNAL_ERROR (500). Errors omit SQL internals.',
 'Rate Limits':'Account routes: 30/minute/IP; social: 45/minute/IP; registered/match: 90/minute/account. Existing guest limits are configurable. Retry after the response limit window.',
};
export default function DocsPage(){
 const [endpoints,setEndpoints]=useState<Endpoint[]>([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[copied,setCopied]=useState('');
 useEffect(()=>{const abort=new AbortController();fetch('/endpoint-reference.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(setEndpoints).catch(()=>{if(!abort.signal.aborted)setError('Unable to load endpoint documentation. Reload to retry.');});return()=>abort.abort();},[]);
 useEffect(()=>{if(!endpoints.length||!window.location.hash)return;const target=document.getElementById(decodeURIComponent(window.location.hash.slice(1)));if(target instanceof HTMLDetailsElement)target.open=true;target?.scrollIntoView?.({block:'start'});},[endpoints]);
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setCopied('Copied.');}catch{setCopied('Copy unavailable. Select the example to copy it.');}};
 return <main className="docs-shell"><header className="flex flex-wrap justify-between gap-4 mb-8"><Link to="/" aria-label="NullChannel home"><Brand/></Link><ThemeToggle/></header><div className="docs-layout"><aside><label htmlFor="docs-search">Search documentation</label><input id="docs-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search topics or endpoints" className="w-full bg-panel border border-accent p-3 my-3"/><nav aria-label="Documentation topics">{Object.keys(topics).filter(t=>!query||t.toLowerCase().includes(query.toLowerCase())).map(t=><a key={t} href={'#'+t.toLowerCase().replaceAll(' ','-')}>{t}</a>)}</nav><a href="/openapi.yaml" download className="text-cyan">Download OpenAPI 3.1</a></aside><article className="min-w-0"><h1 className="text-4xl font-bold mb-3">Documentation</h1><p className="text-muted mb-6">Actual routes and application contracts. Live database deployment must include the recorded migrations.</p><p role="status">{copied}</p>{error&&<p role="alert">{error}</p>}{Object.entries(topics).filter(([t,text])=>!query||(t+' '+text).toLowerCase().includes(query.toLowerCase())).map(([t,text])=><section id={t.toLowerCase().replaceAll(' ','-')} key={t} className="docs-topic"><h2>{t}</h2><p>{text}</p></section>)}<section className="docs-topic" id="endpoints"><h2>HTTP endpoints</h2>{endpoints.filter(e=>(e.method+' '+e.route+' '+e.auth+' '+e.tag+' '+(e.description??'')).toLowerCase().includes(query.toLowerCase())).map(e=><EndpointReference key={e.method+e.route} endpoint={e} copy={copy}/>)}</section></article></div></main>;
}
