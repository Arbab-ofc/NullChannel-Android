import {useSyncExternalStore} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {activeCallSnapshot,subscribeActiveCalls} from '../../lib/active-calls';
import {VoiceCallUI} from './VoiceCallUI';
import type {VoiceCall} from '../../lib/voice-call';
function Tray({call}:{call:VoiceCall}){const view=useSyncExternalStore(call.subscribe,call.snapshot,call.snapshot);const location=useLocation();if(view.visibleRoom&&location.pathname.toUpperCase()===`/CHAT/${call.roomCode}`)return null;return <aside className="persistent-call-tray"><Link to={`/chat/${call.roomCode}`} className="text-cyan">Return to active conversation</Link><VoiceCallUI view={view} call={call} microphoneBusy={false}/></aside>;}
export function PersistentCallTray(){const call=useSyncExternalStore(subscribeActiveCalls,activeCallSnapshot,activeCallSnapshot);return call?<Tray call={call}/>:null;}
