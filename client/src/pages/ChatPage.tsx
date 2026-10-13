import { roomAtmosphere } from '../lib/room-presentation';
import { CopyButton } from '../components/common/CopyButton';
import { ToggleSwitch } from '../components/common/ToggleSwitch';
import { ResponsiveActions } from '../components/mobile/ResponsiveActions';
import { Skeleton } from '../components/common/Skeleton';
import { AttachmentPreview, attachmentError, type PendingAttachment } from '../components/chat/AttachmentPreview';
import { SwipeableMessage } from '../components/chat/SwipeableMessage';
import { FloatingDateSeparator, JumpToLatest } from '../components/chat/TranscriptChrome';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { Brand } from '../components/common/Brand';
import { ReactionIcon, reactionName, reactions } from '../components/chat/ReactionIcon';
import '../styles/chat-redesign.css';
import { ViewOnceMedia } from '../components/chat/ViewOnceMedia';
import { resolveMediaUrl, messageDeadline } from '../lib/temporary-media';
import { accountSocket } from '../lib/account-socket';
import { GroupTools } from '../components/chat/GroupTools';
import { accountApi, accountError } from '../lib/account';
import { useAccount } from '../hooks/useAccount';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link,useNavigate, useParams } from 'react-router-dom';
import { Radio, DoorOpen, Power, Rows2, ImagePlus, Menu, X, House, Trash2, Mic, Square, Pencil, Send, TimerReset, Reply, SmilePlus, MoreVertical, Paperclip, FileText, Download, Pin, PinOff, Images, ExternalLink, Siren, Flame } from 'lucide-react';
import { Button } from '../components/common/Button';
import { mergeHistory } from '../lib/messages';
import { api } from '../lib/api';
import { useVoiceCall } from '../hooks/useVoiceCall';
import { VoiceCallButton, VoiceCallUI } from '../components/call/VoiceCallUI';
import { callIsActive } from '../lib/voice-call';
import { useSocket } from '../hooks/useSocket';
import { useLocalSender } from '../hooks/useLocalSender';
import { useViewportState } from '../hooks/useVisibleViewport';
import { useTranscriptScroll } from '../hooks/useTranscriptScroll';
import { useSeenMessages } from '../hooks/useSeenMessages';
import { ExpiryCountdown } from '../components/chat/ExpiryCountdown';
import { CommandCenter } from '../components/chat/CommandCenter';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { LoadingSignal } from '../components/common/LoadingSignal';
import { publicAppUrl } from '../lib/constants';

type ReactionSummary = { emoji: string; count: number; senders: Array<{ sender_id: string; sender_name: string }> };
type MessageType = 'text'|'image'|'voice'|'file';
type ReplyPreview = { id: string; sender_id: string; sender_name?: string; content?: string; type: MessageType; file_url?: string; file_name?: string };
type Msg = { id?: string; room_id?: string; sender_id: string; sender_name?: string; content?: string; type: MessageType; file_url?: string; file_path?: string; file_name?: string; file_size?: number; mime_type?: string; reply_to_message_id?: string | null; reply_to?: ReplyPreview | null; reactions?: ReactionSummary[]; burn_after_read?: boolean; burn_expires_at?:string|null;ttl_seconds?:number|null;message_expires_at?:string|null;view_once?:boolean;view_consumed_at?:string|null; created_at?: string; deleted?: boolean; deleted_by?: string; deleted_by_name?: string; edited?: boolean };
type Room = { id: string; code: string; creator_id: string; room_type: 'private' | 'group'; room_name: string; expires_at: string; created_at?:string; expiry_extended?: boolean; pinned_message_id?: string | null; room_kind?: string; self_sender_id?: string; self_sender_name?: string; self_role?: 'owner'|'moderator'|'member' };
type SystemNotice = { id: string; text: string };
type TypingPayload = { roomCode?: string; senderId?: string; senderName?: string };
type Participant = { sender_id: string; sender_name: string; joined_at: string; online?: boolean };
type RoomCloseReason = 'expired' | 'terminated-by-creator';

const VOICE_MAX_MS = 2 * 60 * 1000;
const REACTION_EMOJIS = reactions.map(reaction=>reaction.value);

export default function ChatPage() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const guestSenderId = useLocalSender();
  const [senderId,setSenderId] = useState(guestSenderId);
  const { profile } = useAccount();
  const [consentStatus,setConsentStatus] = useState('');
  useEffect(() => {
    const changed = (event: {code:string;purpose:string;status:string;profile?:{username:string};connected?:boolean}) => {
      if (event.code !== code.toUpperCase()) return;
      setConsentStatus(event.status==='mutual' ? `${event.connected?'Friendship established with':'Identity revealed:'} @${event.profile?.username}` : event.status==='declined' ? 'Your partner chose to remain anonymous.' : `Your partner requested ${event.purpose==='connect'?'to stay connected':'identity reveal'}. Choose explicitly below.`);
    };
    accountSocket.on('identity:consent',changed); return () => {accountSocket.off('identity:consent',changed);};
  },[code]);
  const socket = useSocket(code);
  const composerRef=useRef<HTMLTextAreaElement>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [myRooms, setMyRooms] = useState<Array<{ code: string; room_name?: string; room_type?: 'private' | 'group'; expires_at: string }>>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [attachmentSheet,setAttachmentSheet]=useState(false);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [deletingMessageIds, setDeletingMessageIds] = useState<Record<string, boolean>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingBusy, setEditingBusy] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const messageMenuAnchor=useRef<HTMLElement|null>(null);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const closeMessageMenu=useCallback(()=>setMessageMenuId(null),[]);
  const [reactionBusyIds, setReactionBusyIds] = useState<Record<string, boolean>>({});
  const [burnAfterReadMode, setBurnAfterReadMode] = useState(false);
  const [ttlSeconds,setTtlSeconds]=useState(0);const [viewOnce,setViewOnce]=useState(false);
  const [notices, setNotices] = useState<SystemNotice[]>([]);
  const [toast, setToast] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [senderName, setSenderName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [pageState, setPageState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [joinBusy, setJoinBusy] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [terminateBusy, setTerminateBusy] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const [extendBusy, setExtendBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState('30');
  const [joinError, setJoinError] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [expiredNotice, setExpiredNotice] = useState(false);
  const [closeReason, setCloseReason] = useState<RoomCloseReason>('expired');
  const typingTimeouts = useRef<Record<string, number>>({});
  const lastTypingAt = useRef(0);
  const redirectTimeout = useRef<number | null>(null);
  const toastTimeout = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAt = useRef(0);
  const recordingInterval = useRef<number | null>(null);
  const recordingLimitTimeout = useRef<number | null>(null);
  const removedMessageIds = useRef(new Set<string>());
  const historyEpoch = useRef(0);
  const dirtyMessageIds = useRef(new Set<string>());
  const wipedAt = useRef(0);
  const {style:viewport}=useViewportState();
  const connectionStatus = useConnectionStatus(socket);
  const [attachment,setAttachment]=useState<PendingAttachment|null>(null);
  const attachmentBusy=useRef(false);
  const currentAccess=useRef({code,isJoined});currentAccess.current={code,isJoined};
  useEffect(()=>{setAttachment(null);setAttachmentSheet(false);setMessageMenuId(null);},[code,isJoined]);
  useEffect(()=>{if(attachment?.status!=='uploaded')return;const timer=setTimeout(()=>setAttachment(null),1500);return()=>clearTimeout(timer);},[attachment?.status]);
  const selectAttachment=(file:File,kind:'image'|'file')=>{if(attachmentBusy.current)return;const error=attachmentError(file,kind);setAttachment({file,kind,status:error?'failed':'ready',error});};
  const transcript = useTranscriptScroll(messages,notices,code);
  const receiveMessage = transcript.receive;
  useSeenMessages(transcript.element,code.toUpperCase(),senderId,messages,isJoined);
  const [connected,setConnected] = useState(socket.connected);
  const closeMenu = useCallback(() => setMenuOpen(false),[]);
  useEffect(() => {
    const online = () => setConnected(true);
    const offline = () => { setConnected(false); setTypingUsers({}); Object.values(typingTimeouts.current).forEach(window.clearTimeout); typingTimeouts.current = {}; };
    socket.on('connect',online); socket.on('disconnect',offline);
    return () => { socket.off('connect',online); socket.off('disconnect',offline); };
  },[socket]);

  const { call: voiceCall, view: voiceView } = useVoiceCall(socket,code.toUpperCase(),!!room && room.room_type === 'private' && isJoined && !expiredNotice,room?.expires_at,pageState==='ready');

  useEffect(() => { if (voiceView.phase === 'incoming') { setExtendModalOpen(false); setMenuOpen(false); setAttachmentSheet(false); setMessageMenuId(null); } },[voiceView.phase]);

  const loadHistory = useCallback(async (roomCode: string) => {
    const epoch = ++historyEpoch.current;
    const changed = new Set<string>();
    dirtyMessageIds.current = changed;
    setHistoryLoading(true);
    let response;
    try {response=await api.get(`/rooms/${roomCode}/messages`);}finally{if(historyEpoch.current===epoch)setHistoryLoading(false);}
    if (historyEpoch.current !== epoch) return;
    setMessages(current => mergeHistory(response.data.data as Msg[], current, changed, wipedAt.current));
  }, []);

  const loadMyRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const res = profile ? await accountApi.get('/registered/rooms') : await api.get(`/users/${senderId}/rooms`);
      const rooms = profile ? (res.data.data ?? []).map((entry: { rooms: Room }) => entry.rooms) : res.data.data ?? [];
      setMyRooms(rooms);
      return rooms as Array<{ code: string; room_name?: string; room_type?: 'private' | 'group'; expires_at: string }>;
    } finally {
      setRoomsLoading(false);
    }
  }, [senderId,profile]);

  const loadParticipants = useCallback(async (roomCode: string) => {
    setParticipantsLoading(true);
    try {
      const res = await api.get(`/rooms/${roomCode}/participants`);
      setParticipants(res.data.data ?? []);
    } catch {
      setParticipants([]);
    } finally {
      setParticipantsLoading(false);
    }
  }, []);

  const showExpiredPopup = useCallback((reason: RoomCloseReason = 'expired') => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    setCloseReason(reason);
    setExpiredNotice(true);
    setIsJoined(false);
    setTypingUsers({});
    loadMyRooms().catch(() => undefined);
    if (redirectTimeout.current) window.clearTimeout(redirectTimeout.current);
    redirectTimeout.current = window.setTimeout(() => {
      nav('/');
    }, 3000);
  }, [loadMyRooms, nav]);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    wipedAt.current = 0; removedMessageIds.current.clear();
    setParticipants([]);
    setTypingUsers({});
    setPageState('loading');
    setRoom(null);
    (async () => {
      const roomRes = await api.get(`/rooms/${code.toUpperCase()}`, { signal: abort.signal });
      if (cancelled) return;
      const roomData = roomRes.data.data as Room;
      if (roomData.self_sender_id && roomData.self_sender_id !== senderId) { setSenderId(roomData.self_sender_id); return; }
      setRoom(roomData);
      const cached = roomData.self_sender_name ?? sessionStorage.getItem(`nullchannel_name_${roomData.code}`) ?? '';
      setSenderName(cached);
      setNameInput(cached);
      const rooms = await loadMyRooms();
      if (cancelled) return;
      const alreadyJoined = roomData.creator_id === senderId || rooms.some((r) => r.code === roomData.code);
      setIsJoined(alreadyJoined);
      setMessages([]);
      if (alreadyJoined) {
        await loadHistory(code.toUpperCase());
        await loadParticipants(roomData.code);
      }
      if (!cancelled) setPageState('ready');
    })().catch(() => {
      if (cancelled) return;
      setRoom(null);
      setPageState('missing');
      setRoomsLoading(false);
    });
    return () => { cancelled = true; abort.abort(); historyEpoch.current += 1; };
  }, [code, loadMyRooms, loadParticipants, loadHistory, senderId]);

  useEffect(() => {
    if (!room) return;
    const msUntilExpiry = new Date(room.expires_at).getTime() - Date.now();
    if (msUntilExpiry <= 0) {
      showExpiredPopup();
      return;
    }
    const timeout = window.setTimeout(showExpiredPopup, msUntilExpiry);
    return () => window.clearTimeout(timeout);
  }, [room, showExpiredPopup]);

  useEffect(() => () => {
    if (redirectTimeout.current) window.clearTimeout(redirectTimeout.current);
    if (toastTimeout.current) window.clearTimeout(toastTimeout.current);
    if (recordingInterval.current) window.clearInterval(recordingInterval.current);
    if (recordingLimitTimeout.current) window.clearTimeout(recordingLimitTimeout.current);
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    Object.values(typingTimeouts.current).forEach(id => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    if (!room) return;
    const bindings:Array<()=>void>=[];
    const listen=<T,>(event:string,handler:(payload:T)=>void)=>{socket.on(event,handler);bindings.push(()=>socket.off(event,handler));};
    listen('participants-updated', (payload: { roomId: string; online: string[] }) => {
      if (payload.roomId === room.id) setParticipants(current => current.map(member => ({ ...member, online: payload.online.includes(member.sender_id) })));
    });
    const onMembershipRevoked = (payload: { code: string }) => {
      if (payload.code === room.code) { setIsJoined(false); setMessages([]); setParticipants([]); setTypingUsers({}); }
    };
    listen('membership-revoked',onMembershipRevoked);
    listen('room-joined', (joinedRoom: Room) => {
      setRoom(current => current?.id === joinedRoom.id && current?.expires_at === joinedRoom.expires_at ? current : joinedRoom);
      void loadHistory(joinedRoom.code).catch(() => setJoinError('Unable to load message history.'));
      setIsJoined(true);
      setJoinBusy(false);
      setJoinError('');
      loadMyRooms().catch(() => undefined);
      if (room) loadParticipants(room.code).catch(() => undefined);
    });
    listen('socket-error', (payload: { code?: string; message?: string }) => {
      setJoinBusy(false);
      if (payload?.code === 'ROOM_FULL') {
        setJoinError('Private channel is full (max 2 users).');
        nav('/');
        return;
      }
      if (payload?.code === 'NAME_REQUIRED') {
        setJoinError('Enter a display name to join this room.');
        return;
      }
      if (payload?.code === 'VALIDATION_ERROR') {
        setJoinError('Enter a display name to join this room.');
        return;
      }
      if (payload?.message) setJoinError(payload.message);
    });
    listen('receive-message', (msg: Msg) => {
      if ((msg.room_id && msg.room_id !== room.id) || (msg.id && removedMessageIds.current.has(msg.id))) return;
      if (wipedAt.current && msg.created_at && Date.parse(msg.created_at) <= wipedAt.current) return;
      if (msg.id) receiveMessage(msg.id,msg.sender_id === senderId);
      if (msg.id) dirtyMessageIds.current.add(msg.id);
      setMessages((p) => p.some(m => m.id === msg.id) ? p : [...p, msg]);
      window.clearTimeout(typingTimeouts.current[msg.sender_id]);
      setTypingUsers((p) => {
        const next = { ...p };
        delete next[msg.sender_id];
        return next;
      });
    });
    listen('message-deleted', (payload: { messageId?: string; deletedBy?: string; deletedByName?: string }) => {
      if (payload.messageId) dirtyMessageIds.current.add(payload.messageId);
      if (!payload.messageId) return;
      setMessages((p) => p.map((message) => (message.id === payload.messageId ? {
        ...message,
        deleted: true,
        deleted_by: payload.deletedBy,
        deleted_by_name: payload.deletedByName,
        content: 'This message was deleted.',
        file_url: undefined
      } : message)));
      setDeletingMessageIds((p) => {
        const next = { ...p };
        delete next[payload.messageId as string];
        return next;
      });
    });
    listen('message-edited', (payload: { messageId?: string; content?: string }) => {
      if (payload.messageId) dirtyMessageIds.current.add(payload.messageId);
      if (!payload.messageId || typeof payload.content !== 'string') return;
      setMessages((p) => p.map((message) => (message.id === payload.messageId ? {
        ...message,
        content: payload.content,
        edited: true
      } : message)));
    });
    listen('message-reactions', (payload: { messageId?: string; reactions?: ReactionSummary[] }) => {
      if (payload.messageId) dirtyMessageIds.current.add(payload.messageId);
      if (!payload.messageId || !Array.isArray(payload.reactions)) return;
      setMessages((p) => p.map((message) => (message.id === payload.messageId ? {
        ...message,
        reactions: payload.reactions
      } : message)));
    });
    listen('message-burned', (payload: { messageId?: string }) => {
      if (payload.messageId) dirtyMessageIds.current.add(payload.messageId);
      if (!payload.messageId) return;
      removedMessageIds.current.add(payload.messageId);
      setMessages((p) => p.filter((message) => message.id !== payload.messageId).map(message => message.reply_to_message_id === payload.messageId ? { ...message,reply_to: null } : message));
      setReplyingTo((current) => (current?.id === payload.messageId ? null : current));
      setReactionPickerMessageId((current) => (current === payload.messageId ? null : current));
      setMessageMenuId((current) => (current === payload.messageId ? null : current));
    });
    listen('user-left', (payload: { senderId?: string; senderName?: string }) => {
      if (payload?.senderId === senderId) return;
      if (payload.senderId) {
        window.clearTimeout(typingTimeouts.current[payload.senderId]);
        delete typingTimeouts.current[payload.senderId];
        setTypingUsers(current => { const next = { ...current }; delete next[payload.senderId!]; return next; });
      }
      const name = payload?.senderName ?? 'A user';
      setNotices((p) => [...p, { id: `${Date.now()}-${Math.random()}`, text: `${name} left the room` }]);
      setParticipants((p) => p.filter((participant) => participant.sender_id !== payload?.senderId));
      if (payload?.senderId) {
        window.clearTimeout(typingTimeouts.current[payload.senderId]);
        setTypingUsers((p) => {
          const next = { ...p };
          delete next[payload.senderId as string];
          return next;
        });
      }
    });
    listen('user-joined', (payload: { senderId?: string; senderName?: string }) => {
      if (!payload?.senderId || payload.senderId === senderId) return;
      const name = payload.senderName ?? 'A user';
      setNotices((p) => [...p, { id: `${Date.now()}-${Math.random()}`, text: `${name} joined the room` }]);
      loadParticipants(room.code).catch(() => undefined);
    });
    listen('user-typing', (payload: TypingPayload) => {
      if (!payload.senderId || payload.senderId === senderId || payload.roomCode !== room.code) return;
      const name = payload.senderName ?? `User-${payload.senderId.slice(0, 6)}`;
      setTypingUsers((p) => p[payload.senderId as string] === name ? p : ({ ...p, [payload.senderId as string]: name }));
      window.clearTimeout(typingTimeouts.current[payload.senderId]);
      typingTimeouts.current[payload.senderId] = window.setTimeout(() => {
        setTypingUsers((p) => {
          const next = { ...p };
          delete next[payload.senderId as string];
          return next;
        });
      }, 1800);
    });
    const onRoomExpired = (payload: { reason?: RoomCloseReason } = {}) => {
      setIsJoined(false);
      setTypingUsers({});
      loadMyRooms().catch(() => undefined);
      showExpiredPopup(payload.reason === 'terminated-by-creator' ? 'terminated-by-creator' : 'expired');
    };
    listen('room-expired',onRoomExpired);
    listen('room-extended', (payload: { code?: string; expiresAt?: string; extendByMinutes?: number } = {}) => {
      if (payload.code !== room.code || !payload.expiresAt) return;
      const expiresAt = payload.expiresAt;
      setRoom((current) => (current && current.code === room.code ? { ...current, expires_at: expiresAt, expiry_extended: true } : current));
      loadMyRooms().catch(() => undefined);
      const minutes = payload.extendByMinutes ?? 0;
      setNotices((p) => [...p, { id: `${Date.now()}-${Math.random()}`, text: minutes > 0 ? `Room extended by ${minutes} min` : 'Room expiry extended' }]);
    });
    listen('message-pinned', (payload: { code?: string; pinnedMessageId?: string | null } = {}) => {
      if (payload.code !== room.code) return;
      setRoom((current) => (current && current.code === room.code ? { ...current, pinned_message_id: payload.pinnedMessageId ?? null } : current));
      setNotices((p) => [...p, { id: `${Date.now()}-${Math.random()}`, text: payload.pinnedMessageId ? 'Message pinned' : 'Pinned message cleared' }]);
    });
    listen('room-wiped', (payload: { code?: string; wipedMessages?: number; wipedAt?: string } = {}) => {
      if (payload.code !== room.code) return;
      if (payload.wipedAt) wipedAt.current = Date.parse(payload.wipedAt);
      setMessages(current => payload.wipedAt ? current.filter(message => message.created_at && Date.parse(message.created_at) > Date.parse(payload.wipedAt!)) : []);
      setReplyingTo(null);
      setReactionPickerMessageId(null);
      setMessageMenuId(null);
      setRoom((current) => (current && current.code === room.code ? { ...current, pinned_message_id: null } : current));
      const count = payload.wipedMessages ?? 0;
      setNotices((p) => [...p, { id: `${Date.now()}-${Math.random()}`, text: count > 0 ? `Panic wipe cleared ${count} messages` : 'Panic wipe cleared the room' }]);
    });

    const rejoin = () => {
      if (isJoined && senderName && room.code === code.toUpperCase()) {
        socket.emit('join-room', { roomCode: room.code, senderId, senderName });
      }
    };
    listen('connect', rejoin);
    if (socket.connected) rejoin();

    return () => {bindings.forEach(remove=>remove());
      Object.values(typingTimeouts.current).forEach((id) => window.clearTimeout(id));
      typingTimeouts.current = {};
    };
  }, [code, room, socket, senderId, senderName, isJoined, loadMyRooms, loadParticipants, loadHistory, showExpiredPopup, nav, receiveMessage]);

  const joinCurrentRoom = (nameOverride?: string) => {
    if (!room) return;
    const effectiveName = (nameOverride ?? senderName).trim();
    if (!effectiveName) {
      setJoinError('Enter a display name to join this room.');
      return;
    }
    if (!socket.connected) socket.connect();
    setJoinBusy(true);
    setJoinError('');
    socket.emit('join-room', { roomCode: room.code, senderId, senderName: effectiveName });
  };

  const send = () => {
    if (!room || !text.trim() || !isJoined) return;
    if (!senderName) return;
    socket.emit('send-message', {
      roomCode: room.code,
      senderId,
      senderName: senderName || undefined,
      type: 'text',
      content: text.trim(),
      replyToMessageId: replyingTo?.id,
      burnAfterRead: burnAfterReadMode,
      ...(ttlSeconds?{ttlSeconds}: {})
    });
    setText('');
    setReplyingTo(null);
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (!room || !isJoined || !value.trim()) return;
    if (!senderName) return;
    const now = Date.now();
    if (now - lastTypingAt.current < 900) return;
    lastTypingAt.current = now;
    socket.emit('typing', { roomCode: room.code, senderId, senderName: senderName || undefined });
  };

  const sendImage = async (file: File) => {
    if (!room || !isJoined || !socket.connected) return false;
    if (!senderName) return false;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) return;

    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('roomCode', room.code);
      form.append('senderId', senderId);
      form.append('type', 'image');
      const res = await api.post('/media/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: event=>{const progress=event.total?Math.min(100,Math.round(event.loaded/event.total*100)):undefined;setAttachment(previous=>previous?.file===file?{...previous,progress}:previous);}
      });

      if(currentAccess.current.code!==code || !currentAccess.current.isJoined || !socket.connected)throw new Error('Room access changed after upload');
      socket.emit('send-message', {
        roomCode: room.code,
        senderId,
        senderName: senderName || undefined,
        type: 'image',
        viewOnce,
        fileUrl: res.data.data.fileUrl,
        filePath: res.data.data.filePath,
        replyToMessageId: replyingTo?.id,
        burnAfterRead: burnAfterReadMode,
      ...(ttlSeconds?{ttlSeconds}: {})
      });
      setReplyingTo(null);
      return true;
    } catch {
      return false;
    } finally {
      setUploadingImage(false);
    }
  };

  const sendFile = async (file: File) => {
    if (!room || !isJoined || !socket.connected) return false;
    if (!senderName) return false;
    if (file.size > 15 * 1024 * 1024) {
      showToast('File limit is 15 MB');
      return;
    }

    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('roomCode', room.code);
      form.append('senderId', senderId);
      form.append('type', 'file');
      const res = await api.post('/media/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: event=>{const progress=event.total?Math.min(100,Math.round(event.loaded/event.total*100)):undefined;setAttachment(previous=>previous?.file===file?{...previous,progress}:previous);}
      });

      if(currentAccess.current.code!==code || !currentAccess.current.isJoined || !socket.connected)throw new Error('Room access changed after upload');
      socket.emit('send-message', {
        roomCode: room.code,
        senderId,
        senderName: senderName || undefined,
        type: 'file',
        viewOnce,
        content: file.name,
        fileUrl: res.data.data.fileUrl,
        filePath: res.data.data.filePath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        replyToMessageId: replyingTo?.id,
        burnAfterRead: burnAfterReadMode,
      ...(ttlSeconds?{ttlSeconds}: {})
      });
      setReplyingTo(null);
      return true;

    } catch {
      return false;
    } finally {
      setUploadingFile(false);
    }
  };

  const sendAttachment=async()=>{
    if(!attachment || attachment.status!=='ready' || attachmentBusy.current || !socket.connected)return;
    attachmentBusy.current=true;const selected=attachment;
    setAttachment({...selected,status:'uploading'});
    try {const success=await (selected.kind==='image'?sendImage(selected.file):sendFile(selected.file));
      setAttachment(previous=>previous?.file===selected.file?{...previous,status:success?'uploaded':'failed',error:success?undefined:'Upload could not be confirmed. Automatic retry is disabled to avoid duplicate media.'}:previous);
    } finally {attachmentBusy.current=false;}
  };

  const emitVoiceMessage = async (blob: Blob) => {
    if (!room || !isJoined || !senderName || blob.size === 0) return;
    setUploadingVoice(true);
    try {
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
      const form = new FormData();
      form.append('file', file);
      form.append('roomCode', room.code);
      form.append('senderId', senderId);
      form.append('type', 'voice');
      const res = await api.post('/media/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      socket.emit('send-message', {
        roomCode: room.code,
        senderId,
        senderName,
        type: 'voice',
        viewOnce,
        fileUrl: res.data.data.fileUrl,
        filePath: res.data.data.filePath,
        replyToMessageId: replyingTo?.id,
        burnAfterRead: burnAfterReadMode,
      ...(ttlSeconds?{ttlSeconds}: {})
      });
      setReplyingTo(null);
      showToast('Voice sent');
    } catch {
      showToast('Voice upload failed');
    } finally {
      setUploadingVoice(false);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const startVoiceRecording = async () => {
    if (!room || !isJoined || !senderName || recordingVoice || uploadingVoice || callIsActive(voiceView.phase)) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('Voice recording unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      recordingStartedAt.current = Date.now();
      setRecordingSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        voiceChunksRef.current = [];
        setRecordingVoice(false);
        setRecordingSeconds(0);
        if (recordingInterval.current) window.clearInterval(recordingInterval.current);
        if (recordingLimitTimeout.current) window.clearTimeout(recordingLimitTimeout.current);
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        emitVoiceMessage(blob).catch(() => undefined);
      };

      recorder.start();
      setRecordingVoice(true);
      recordingInterval.current = window.setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt.current) / 1000));
      }, 500);
      recordingLimitTimeout.current = window.setTimeout(stopVoiceRecording, VOICE_MAX_MS);
    } catch {
      showToast('Mic permission denied');
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimeout.current) window.clearTimeout(toastTimeout.current);
    toastTimeout.current = window.setTimeout(() => setToast(''), 1800);
  };

  const deleteMessage = async (messageId?: string) => {
    if (!room || !messageId || deletingMessageIds[messageId]) return;
    setDeletingMessageIds((p) => ({ ...p, [messageId]: true }));
    try {
      const res = await api.delete(`/rooms/${room.code}/messages/${messageId}`, { data: { senderId } });
      const deletedId = res.data.data?.messageId ?? messageId;
      setMessages((p) => p.map((message) => (message.id === deletedId ? {
        ...message,
        deleted: true,
        deleted_by: res.data.data?.deletedBy ?? senderId,
        deleted_by_name: res.data.data?.deletedByName ?? senderName,
        content: 'You deleted this message.',
        file_url: undefined
      } : message)));
      showToast('Message deleted');
    } catch {
      showToast('Delete failed');
    } finally {
      setDeletingMessageIds((p) => {
        const next = { ...p };
        delete next[messageId];
        return next;
      });
    }
  };

  const quoteLabel = (message?: ReplyPreview | Msg | null) => {
    if (!message) return 'Message unavailable';
    if (message.type === 'image') return 'Image transmission';
    if (message.type === 'voice') return 'Voice transmission';
    if (message.type === 'file') return message.file_name || message.content || 'File attachment';
    return message.content || 'Text transmission';
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  };

  const firstUrl = (value?: string) => value?.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? null;

  const linkPreview = (value?: string) => {
    const url = firstUrl(value);
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return {
        url,
        host: parsed.hostname.replace(/^www\./, ''),
        path: `${parsed.pathname}${parsed.search}`.replace(/\/$/, '') || '/'
      };
    } catch {
      return null;
    }
  };

  const pinMessage = async (messageId: string | null) => {
    if (!room || room.creator_id !== senderId || pinBusy) return;
    setPinBusy(true);
    try {
      const res = await api.patch(`/rooms/${room.code}/pin`, { senderId, messageId });
      setRoom(res.data.data);
      setMessageMenuId(null);
      showToast(messageId ? 'Message pinned' : 'Pinned message cleared');
    } catch {
      showToast('Pin failed');
    } finally {
      setPinBusy(false);
    }
  };

  const startReply = (message: Msg) => {
    if (!message.id || message.deleted || !isJoined) return;
    setReplyingTo(message);
    setMessageMenuId(null);
  };

  const toggleReaction = async (message: Msg, emoji: string) => {
    if (!room || !message.id || !isJoined || !senderName || message.deleted) return;
    const key = `${message.id}:${emoji}`;
    if (reactionBusyIds[key]) return;
    setReactionBusyIds((p) => ({ ...p, [key]: true }));
    try {
      const res = await api.post(`/rooms/${room.code}/messages/${message.id}/reactions`, { senderId, senderName, emoji });
      const reactions = res.data.data?.reactions ?? [];
      setMessages((p) => p.map((item) => (item.id === message.id ? { ...item, reactions } : item)));
      setReactionPickerMessageId(null);
      setMessageMenuId(null);
    } catch {
      showToast('Reaction failed');
    } finally {
      setReactionBusyIds((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  };

  const canEditMessage = (message: Msg) => {
    if (!message.id || message.deleted || message.type !== 'text' || message.sender_id !== senderId || !message.created_at) return false;
    return Date.now() - new Date(message.created_at).getTime() <= 2 * 60 * 1000;
  };

  const startEditMessage = (message: Msg) => {
    if (!message.id || !canEditMessage(message)) return;
    setEditingMessageId(message.id);
    setEditingText(message.content ?? '');
    setMessageMenuId(null);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingText('');
    setEditingBusy(false);
  };

  const saveEditedMessage = async () => {
    if (!room || !editingMessageId || editingBusy) return;
    const content = editingText.trim();
    if (!content) return;
    setEditingBusy(true);
    try {
      await api.patch(`/rooms/${room.code}/messages/${editingMessageId}`, { senderId, content });
      setMessages((p) => p.map((message) => (message.id === editingMessageId ? { ...message, content, edited: true } : message)));
      cancelEditMessage();
      showToast('Message edited');
    } catch {
      showToast('Edit window closed');
      setEditingBusy(false);
    }
  };

  const leaveRoom = async () => {
    if (!room || !isJoined || leaveBusy) return;
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    setLeaveBusy(true);
    try {
      socket.emit('leave-room', { roomCode: room.code, senderId, senderName: senderName || undefined });
      await api.post(`/rooms/${room.code}/leave`, { senderId }).catch(() => undefined);
      setIsJoined(false);
      setTypingUsers({});
      setParticipants((p) => p.filter((participant) => participant.sender_id !== senderId));
      await loadMyRooms();
    } finally {
      setLeaveBusy(false);
    }
  };

  const extendRoomExpiry = async () => {
    const extendByMinutes = Number(extendMinutes);
    if (!Number.isInteger(extendByMinutes) || extendByMinutes < 5 || extendByMinutes > 1440) {
      showToast('Enter 5 to 1440 minutes');
      return;
    }
    if (!room || room.creator_id !== senderId || room.expiry_extended || extendBusy) return;
    setExtendBusy(true);
    try {
      const res = await api.post(`/rooms/${room.code}/extend`, { senderId, extendByMinutes });
      const updated = res.data.data as Room;
      setRoom(updated);
      await loadMyRooms();
      setExtendModalOpen(false);
      showToast(`Extended by ${extendByMinutes} min`);
    } catch {
      showToast('Extend failed');
    } finally {
      setExtendBusy(false);
    }
  };

  const terminateRoom = async () => {
    if (!room || terminateBusy) return;
    if (!window.confirm('End this temporary room now? Its messages and attachments cannot be restored.')) return;
    setTerminateBusy(true);
    try {
      await api.post(`/rooms/${room.code}/terminate`, { senderId });
      await loadMyRooms();
      showExpiredPopup('terminated-by-creator');
    } finally {
      setTerminateBusy(false);
    }
  };

  const panicWipeRoom = async () => {
    if (!room || room.creator_id !== senderId || wipeBusy) return;
    const confirmed = window.confirm('Panic wipe deletes every message and shared file in this room, but keeps the room open. Continue?');
    if (!confirmed) return;
    setWipeBusy(true);
    try {
      const res = await api.post(`/rooms/${room.code}/wipe`, { senderId });
      const cutoff = Date.parse(res.data.data.wipedAt);
      wipedAt.current = cutoff;
      setMessages(current => current.filter(message => message.created_at && Date.parse(message.created_at) > cutoff));
      setReplyingTo(null);
      setReactionPickerMessageId(null);
      setMessageMenuId(null);
      setRoom((current) => (current ? { ...current, pinned_message_id: null } : current));
      showToast(`Wiped ${res.data.data?.wipedMessages ?? 0} messages`);
    } catch {
      showToast('Wipe failed');
    } finally {
      setWipeBusy(false);
    }
  };

  useEffect(()=>{
    const deadlines=messages.filter(message=>!message.deleted&&message.id).map(messageDeadline).filter((value):value is number=>value!==null);
    if(!deadlines.length)return;const earliest=Math.min(...deadlines);
    const timer=window.setTimeout(()=>{
      const expired=new Set(messages.filter(message=>{const deadline=messageDeadline(message);return deadline!==null&&deadline<=Date.now();}).map(message=>message.id).filter((id):id is string=>!!id));
      expired.forEach(id=>{removedMessageIds.current.add(id);dirtyMessageIds.current.add(id);});
      setMessages(current=>current.filter(message=>!message.id||!expired.has(message.id)).map(message=>message.reply_to_message_id&&expired.has(message.reply_to_message_id)?{...message,reply_to:null}:message));
      setReplyingTo(current=>current?.id&&expired.has(current.id)?null:current);setReactionPickerMessageId(current=>current&&expired.has(current)?null:current);setMessageMenuId(current=>current&&expired.has(current)?null:current);
    },Math.max(0,earliest-Date.now())+10);return()=>window.clearTimeout(timer);
  },[messages]);

  useEffect(()=>{
    const input=composerRef.current;if(!input)return;
    input.style.height='auto';
    const limit=window.matchMedia('(max-height: 500px)').matches?72:120;
    input.style.height=`${Math.min(limit,Math.max(44,input.scrollHeight))}px`;
  },[text]);

  const typingNames = Object.values(typingUsers);
  const typingLabel = typingNames.length > 1 ? `${typingNames.slice(0, 2).join(', ')} are typing` : `${typingNames[0] ?? 'Someone'} is typing`;
  const recordingTime = `${Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:${(recordingSeconds % 60).toString().padStart(2, '0')}`;
  const deletedText = (message: Msg) => `${message.deleted_by === senderId ? 'You' : (message.deleted_by_name ?? 'A member')} deleted this transmission.`;
  const reactionTarget = reactionPickerMessageId ? messages.find((message) => message.id === reactionPickerMessageId) : null;
  const pinnedMessage = room?.pinned_message_id ? messages.find((message) => message.id === room.pinned_message_id && !message.deleted) : null;
  const imageMessages = messages.filter((message) => !message.deleted && !message.view_once && message.type === 'image' && message.file_url);
  const closeCopy = closeReason === 'terminated-by-creator'
    ? {
      eyebrow: 'ROOM TERMINATED',
      title: 'This channel was terminated',
      body: 'The channel creator closed this room. You will be redirected home in 3 seconds.',
      loading: 'Returning home'
    }
    : {
      eyebrow: 'ROOM EXPIRED',
      title: 'This channel has disappeared',
      body: 'The room timer ended. You will be redirected home in 3 seconds.',
      loading: 'Closing session'
    };

  if (expiredNotice) return <main className="grid min-h-screen place-items-center bg-bg p-6">
    <div className="neo-panel loading-panel max-w-md p-8 text-center">
      <p className="code-font text-xs tracking-[0.2em] text-punch">{closeCopy.eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black uppercase">{closeCopy.title}</h2>
      <p className="mt-3 text-sm text-muted">{closeCopy.body}</p>
      <LoadingSignal label={closeCopy.loading} className="mt-5 justify-center text-sm uppercase tracking-[0.16em] text-muted" />
    </div>
  </main>;

  if (pageState === 'loading') return <main className="grid min-h-screen place-items-center bg-bg p-6">
    <div className="neo-panel loading-panel max-w-md p-8 text-center">
      <p className="code-font text-xs tracking-[0.2em] text-cyan">SYNCING CHANNEL</p>
      <h2 className="mt-2 text-2xl font-black uppercase">Loading secure room</h2>
      <LoadingSignal label="Resolving room data" className="mt-5 justify-center text-sm uppercase tracking-[0.16em] text-muted" />
    </div>
  </main>;

  if (!room) return <main className="grid min-h-screen place-items-center bg-bg p-6">
    <div className="neo-panel max-w-md p-8 text-center">
      <p className="code-font text-xs tracking-[0.2em] text-cyan">SESSION TERMINATED</p>
      <h2 className="mt-2 text-2xl font-black uppercase">Channel not found or expired</h2>
    </div>
  </main>;

  return <main style={viewport} data-atmosphere={roomAtmosphere(room)} data-compact={viewport.height ? parseFloat(String(viewport.height)) < 500 : undefined} className="chat-shell bg-bg">
    {attachmentSheet && <Modal sheet titleId="attachment-heading" close={()=>setAttachmentSheet(false)}><h2 id="attachment-heading">Share an attachment</h2><p className="my-3 text-muted">Preview your file before sending.</p><div className="sheet-actions"><Button onClick={()=>{document.getElementById('chat-image-input')?.click();setAttachmentSheet(false);}}><ImagePlus aria-hidden="true"/>Image · up to 5 MB</Button><Button onClick={()=>{document.getElementById('chat-file-input')?.click();setAttachmentSheet(false);}}><FileText aria-hidden="true"/>File · up to 15 MB</Button></div><Button className="mt-4" onClick={()=>setAttachmentSheet(false)}>Close</Button></Modal>}
    {!senderName && <Modal titleId="chat-name-title" close={()=>nav('/')}>
      <div className="neo-panel w-full max-w-md p-6">
        <p className="code-font text-xs tracking-[0.2em] text-cyan">ENTER DISPLAY NAME</p>
        <h3 id="chat-name-title" className="mt-2 text-xl font-bold">What should we call you?</h3>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          aria-label="Your name"
          autoFocus
          placeholder="Your name"
          className="mt-4 h-11 w-full border-2 border-accent bg-bg px-3"
          maxLength={24}
        />
        <Button
          className="mt-3 w-full"
          disabled={joinBusy}
          onClick={() => {
            const value = nameInput.trim();
            if (value.length < 2) return;
            sessionStorage.setItem(`nullchannel_name_${room.code}`, value);
            setSenderName(value);
            joinCurrentRoom(value);
          }}
        >
          {joinBusy ? <LoadingSignal label="Joining" /> : 'Continue'}
        </Button>
      </div>
    </Modal>}
    {extendModalOpen && room.creator_id === senderId && (
      <Modal titleId="chat-extend-title" close={()=>{if(!extendBusy)setExtendModalOpen(false);}}>
        <div className="neo-panel w-full max-w-sm p-5">
          <p className="code-font text-xs tracking-[0.2em] text-cyan">EXTEND EXPIRY</p>
          <h3 id="chat-extend-title" className="mt-2 text-xl font-bold">A little more time.</h3>
          <input
            value={extendMinutes}
            onChange={(e) => setExtendMinutes(e.target.value.replace(/\D/g, '').slice(0, 4))}
            aria-label="Extension in minutes"
            placeholder="Minutes"
            className="mt-4 h-11 w-full border-2 border-accent bg-bg px-3 text-sm"
            inputMode="numeric"
            disabled={extendBusy}
            autoFocus
          />
          <p className="mt-2 text-xs text-muted">Enter 5 to 1440 minutes. This can be used once per room.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => setExtendModalOpen(false)} disabled={extendBusy}>Cancel</Button>
            <Button
              className="border-cyan text-cyan"
              onClick={extendRoomExpiry}
              disabled={extendBusy || !extendMinutes || Number(extendMinutes) < 5 || Number(extendMinutes) > 1440}
            >
              {extendBusy ? <LoadingSignal label="Extending" /> : 'Extend'}
            </Button>
          </div>
        </div>
      </Modal>
    )}
    <section className="chat-workspace">
      <header className="chat-header neo-panel shrink-0 p-2 sm:p-3">
        <div className="chat-header__summary">
          <div className="chat-header__identity min-w-0">
            <p className="code-font hidden text-xs tracking-[0.2em] text-cyan sm:block">NULLCHANNEL / SESSION ACTIVE</p>
            <p className="mt-1 truncate text-sm font-semibold" title={room.room_name}>{room.room_name}</p>
            <p className="code-font mt-1 text-[10px] tracking-widest sm:text-sm">CHANNEL ID: {room.code}</p>
          </div>
          <div className="chat-header__actions">
            {room.room_type === 'private' && <VoiceCallButton view={voiceView} available={participants.some(member => member.sender_id !== senderId && member.online === true)} disabled={!isJoined || recordingVoice || uploadingVoice || !connected} start={() => void voiceCall.invite()} />}
            <ExpiryCountdown expiresAt={room.expires_at} createdAt={room.created_at}/>
            <button type="button" className="chat-menu-toggle neo-action xl:hidden" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle chat menu" aria-expanded={menuOpen} aria-controls="chat-command-center"><Menu className="h-5 w-5" /></button>
          </div>
          <span role="status" className={`connection-status ${isJoined && connected ? '' : 'connection-status--idle'}`}>
            {isJoined && connected && <Radio className="connection-status__icon" />}{!isJoined ? 'Not Joined' : connectionStatus}
          </span>
        </div>
        <CommandCenter immediate={extendModalOpen || voiceView.phase === 'incoming'} open={menuOpen} close={closeMenu} code={room.code}>
          <section className="command-group"><h3>Appearance</h3><div><ThemeToggle /></div></section>
          <section className="command-group"><h3>Channel</h3><div>
              {room.creator_id !== senderId && (
                <Button className={!isJoined ? 'bg-accent text-bg' : ''} onClick={isJoined ? leaveRoom : () => joinCurrentRoom()} disabled={(joinBusy && !isJoined) || leaveBusy}>
                  <DoorOpen className="mr-2 inline h-4 w-4" />
                  {leaveBusy ? <LoadingSignal label="Leaving" /> : isJoined ? 'Leave Room' : (joinBusy ? <LoadingSignal label="Joining" /> : 'Join Room')}
                </Button>
              )}
              <CopyButton value={room.code} label="Copy Channel ID" onCopied={()=>showToast('Channel ID copied')} onError={showToast}/>
              <CopyButton value={publicAppUrl(window.location.href)} label="Copy Invite Link" onCopied={()=>showToast('Invite link copied')} onError={showToast}/>
              {room.creator_id === senderId && (
                <Button
                  className="border-cyan text-cyan"
                  onClick={() => { closeMenu(); setExtendModalOpen(true); }}
                  disabled={!!room.expiry_extended || !!extendBusy}
                  title={room.expiry_extended ? 'This channel has already been extended' : 'Extend expiry'}
                >
                  <TimerReset className="mr-2 inline h-4 w-4" />
                  {extendBusy ? <LoadingSignal label="Extending" /> : 'Extend Expiry'}
                </Button>
              )}
            </div></section>
          <section className="command-group"><h3>Navigation</h3><div><Button onClick={() => { closeMenu(); nav(profile?'/dashboard':'/'); }}><House className="mr-2 inline h-4 w-4" />Home</Button></div></section>
          {room.creator_id === senderId && <section className="command-group command-group--danger"><h3>Danger Zone</h3><div>
              {room.creator_id === senderId && <Button className="border-punch text-punch" onClick={panicWipeRoom} disabled={wipeBusy}><Siren className="mr-2 inline h-4 w-4" />{wipeBusy ? <LoadingSignal label="Wiping" /> : 'Panic Wipe'}</Button>}
              {room.creator_id === senderId && <Button className="border-punch text-punch" onClick={terminateRoom} disabled={terminateBusy}><Power className="mr-2 inline h-4 w-4" />{terminateBusy ? <LoadingSignal label="Terminating" /> : 'Terminate'}</Button>}
            </div></section>}
        </CommandCenter>
      </header>
      <VoiceCallUI view={voiceView} call={voiceCall} microphoneBusy={recordingVoice || uploadingVoice} />

      {pinnedMessage && (
        <section className="pinned-message neo-panel">
          <div className="flex min-w-0 items-center gap-2">
            <Pin className="h-4 w-4 shrink-0 text-cyan" />
            <div className="min-w-0">
              <p className="pinned-message__label">Pinned message</p>
              <p className="pinned-message__content">{quoteLabel(pinnedMessage)}</p>
            </div>
          </div>
          {room.creator_id === senderId && (
            <button className="pinned-message__clear" onClick={() => pinMessage(null)} disabled={pinBusy} type="button" aria-label="Unpin message">
              <PinOff className="h-4 w-4" />
            </button>
          )}
        </section>
      )}

      <div className="transcript-frame"><FloatingDateSeparator element={transcript.element} revision={messages}/><JumpToLatest visible={transcript.away} unread={transcript.unread} onClick={transcript.newest}/><section ref={transcript.ref} aria-label="Messages" className="chat-transcript neo-panel min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4 lg:p-5">
        <div className="transcript-content space-y-3">
        {!isJoined && room.creator_id !== senderId && (
          <div className="border-2 border-punch bg-panel px-3 py-2 text-xs uppercase tracking-wider text-muted">
            Press Join Room to enter this channel.
          </div>
        )}
        {!!joinError && (
          <div className="border-2 border-punch bg-panel px-3 py-2 text-xs uppercase tracking-wider text-punch">
            {joinError}
          </div>
        )}
        {notices.map((n) => (
          <div key={n.id} className="mx-auto w-fit border-2 border-punch bg-panel px-3 py-1 text-xs uppercase tracking-wider text-muted">
            {n.text}
          </div>
        ))}
        {historyLoading && messages.length === 0 && <Skeleton kind="messages" label="Loading message history"/>}
        {!historyLoading && !joinError && messages.length === 0 && <EmptyState title="Nothing here yet." description="Start the conversation."/>}
        {room.room_kind && room.room_kind !== 'guest' && <details className="border border-accent p-3 my-3"><summary>Report a participant</summary><p className="text-sm text-muted">Reports store a reason and account references for 7 days. No message bodies or attachments are retained.</p><form className="flex flex-wrap gap-2 mt-3" onSubmit={event => {event.preventDefault();const data=new FormData(event.currentTarget);void accountApi.post(`/registered/rooms/${room.code}/report`,{senderId:data.get('senderId'),reason:data.get('reason')}).then(()=>setConsentStatus('Report submitted. No conversation evidence was stored.')).catch(error=>setConsentStatus(accountError(error)));}}><label>Participant<select required name="senderId" className="block bg-panel border border-accent p-2"><option value="">Choose participant</option>{participants.filter(p=>p.sender_id!==senderId).map(p=><option key={p.sender_id} value={p.sender_id}>{p.sender_name}</option>)}</select></label><label>Reason<select name="reason" className="block bg-panel border border-accent p-2"><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="unsafe_content">Unsafe content</option><option value="other">Other</option></select></label><Button type="submit">Submit report</Button></form><p role="status">{room.room_kind!=='match'&&consentStatus}</p></details>}
        {['group','public'].includes(room.room_kind ?? '') && <GroupTools code={room.code} selfSenderId={senderId} role={room.self_role ?? 'member'} participants={participants} socket={socket} />}
        {room.room_kind === 'match' && <section className="border border-accent p-3 my-3" aria-label="Anonymous connection choices">
          <p className="text-sm text-muted">Your identity stays hidden until you both consent.</p>
          <div className="flex flex-wrap gap-2 mt-2">{(['reveal','connect'] as const).map(purpose => <Button key={purpose} onClick={() => {
            void accountApi.post(`/match/rooms/${room.code}/consent`,{purpose,accept:true}).then(response => {
              const result=response.data.data;
              setConsentStatus(result.mutual ? `${result.connected ? 'Friendship established with' : 'Identity revealed:'} @${result.profile.username}` : 'Your consent is recorded. Waiting for mutual consent.');
            }).catch(error => setConsentStatus(accountError(error)));
          }}>{purpose === 'reveal' ? 'Reveal identity' : 'Stay Connected'}</Button>)}
          <Button onClick={() => { void Promise.all(['reveal','connect'].map(purpose => accountApi.post(`/match/rooms/${room.code}/consent`,{purpose,accept:false}))).then(() => setConsentStatus('You chose to stay anonymous.')).catch(error => setConsentStatus(accountError(error))); }}>Stay Anonymous</Button>
          <Button onClick={() => { if(!window.confirm('Block this anonymous participant and end the session?'))return; void accountApi.post(`/match/rooms/${room.code}/block`).then(()=>nav('/match')).catch(error=>setConsentStatus(accountError(error))); }}>Block participant</Button>
          <Button onClick={() => { void accountApi.post(`/registered/rooms/${room.code}/terminate`).then(() => nav('/match')).catch(error => setConsentStatus(accountError(error))); }}>Skip &amp; search again</Button></div>
          <p role="status" className="text-sm mt-2">{consentStatus}</p>
        </section>}
        {messages.map((m, i) => <SwipeableMessage key={m.id ?? i} enabled={isJoined && !!m.id && !m.deleted} onReply={()=>startReply(m)}><article data-message-date={m.created_at} data-message-id={m.id} data-grouped={i > 0 && !m.deleted && !messages[i-1].deleted && messages[i-1].sender_id === m.sender_id && Math.abs(Date.parse(m.created_at ?? '') - Date.parse(messages[i-1].created_at ?? '')) < 300000} key={m.id ?? i} className={`chat-message ${m.sender_id === senderId ? 'chat-message--self' : ''} ${m.deleted ? 'chat-message--deleted' : ''} group relative max-w-[94%] border-2 p-2.5 text-sm shadow-panel sm:max-w-[82%] lg:max-w-[70%] ${m.deleted ? 'mx-auto border-punch/70 bg-panel text-muted' : m.sender_id === senderId ? 'ml-auto border-cyan bg-cyan/10' : 'border-accent bg-accent/10'}`}>
          <div className="message-row-head mb-1">
            <p className="message-sender-label text-[10px] uppercase tracking-wider text-muted">{m.deleted ? 'Message removed' : m.sender_id === senderId ? 'You' : (m.sender_name ?? 'Member')}</p>
            {!m.deleted && m.id && (
              <div className="message-actions relative">
                <button
                  className={`message-delete-button ${messageMenuId === m.id ? 'message-delete-button--active' : ''}`}
                  onClick={event => {messageMenuAnchor.current=event.currentTarget.closest('article');setMessageMenuId((current) => (current === m.id ? null : m.id ?? null));}}
                  aria-label="Open message options"
                  title="Message options"
                  type="button"
                >
                  {messageMenuId === m.id ? <X className="h-3.5 w-3.5" /> : <MoreVertical className="h-3.5 w-3.5" />}
                </button>
                {messageMenuId === m.id && (
                  <ResponsiveActions anchor={messageMenuAnchor.current} close={closeMessageMenu} className={`message-options-menu ${m.sender_id === senderId ? 'right-0' : 'left-0'}`}>
                    {isJoined && (
                      <button type="button" onClick={() => startReply(m)}>
                        <Reply className="h-3.5 w-3.5" />
                        <span>Reply</span>
                      </button>
                    )}
                    {room.creator_id === senderId && (
                      <button
                        type="button"
                        onClick={() => pinMessage(room.pinned_message_id === m.id ? null : m.id ?? null)}
                        disabled={pinBusy}
                      >
                        {room.pinned_message_id === m.id ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        <span>{room.pinned_message_id === m.id ? 'Unpin' : 'Pin'}</span>
                      </button>
                    )}
                    {isJoined && (
                      <button
                        type="button"
                        onClick={() => {
                          setReactionPickerMessageId(m.id ?? null);
                          setMessageMenuId(null);
                        }}
                      >
                        <SmilePlus className="h-3.5 w-3.5" />
                        <span>React</span>
                      </button>
                    )}
                    {m.sender_id === senderId && canEditMessage(m) && (
                      <button type="button" onClick={() => startEditMessage(m)} disabled={editingBusy}>
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                    )}
                    {m.sender_id === senderId && (
                      <button
                        type="button"
                        onClick={() => {
                          setMessageMenuId(null);
                          deleteMessage(m.id);
                        }}
                        disabled={!!deletingMessageIds[m.id]}
                        className="message-options-menu__danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{deletingMessageIds[m.id] ? 'Deleting' : 'Delete'}</span>
                      </button>
                    )}
                  </ResponsiveActions>
                )}
              </div>
            )}
          </div>
          {!m.deleted && m.reply_to && (
            <div className="reply-quote mb-2">
              <p className="reply-quote__name">{m.reply_to.sender_id === senderId ? 'You' : (m.reply_to.sender_name ?? 'Member')}</p>
              <p className="reply-quote__content">{quoteLabel(m.reply_to)}</p>
            </div>
          )}
          {!m.deleted && m.message_expires_at && <p className="mb-2 text-xs text-muted">Expires {new Date(m.message_expires_at).toLocaleTimeString()}</p>}
          {!m.deleted && m.burn_after_read && (
            <div className="burn-badge mb-2">
              <Flame className="h-3.5 w-3.5" />
              <span>{m.sender_id === senderId ? 'Destroys 60s after another member sees it' : 'Destroys 60s after viewing'}</span>
            </div>
          )}
          {m.deleted && <p className="code-font text-xs uppercase tracking-[0.16em]">{deletedText(m)}</p>}
          {!m.deleted && m.type === 'text' && editingMessageId === m.id && (
            <div className="grid gap-2">
              <textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                className="min-h-20 w-full resize-none border-2 border-cyan bg-bg px-3 py-2 text-sm text-text outline-none"
                maxLength={12000}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button className="message-delete-button" onClick={cancelEditMessage} disabled={editingBusy}>Cancel</button>
                <button className="message-delete-button" onClick={saveEditedMessage} disabled={editingBusy || !editingText.trim()}>{editingBusy ? 'Saving' : 'Save'}</button>
              </div>
            </div>
          )}
          {!m.deleted && m.type === 'text' && editingMessageId !== m.id && (
            <>
              <p className="whitespace-pre-wrap">{m.content}{m.edited && <span className="ml-2 text-[10px] uppercase tracking-wider text-muted">(edited)</span>}</p>
              {linkPreview(m.content) && (
                <a className="link-preview" href={linkPreview(m.content)?.url} target="_blank" rel="noreferrer">
                  <div className="link-preview__icon"><ExternalLink className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="link-preview__host">{linkPreview(m.content)?.host}</p>
                    <p className="link-preview__path">{linkPreview(m.content)?.path}</p>
                  </div>
                </a>
              )}
            </>
          )}
          {!m.deleted && m.view_once && m.type !== 'text' && m.file_url && <ViewOnceMedia url={m.file_url} type={m.type} name={m.file_name} consumed={!!m.view_consumed_at} isSender={m.sender_id===senderId}/>}
          {!m.deleted && !m.view_once && m.type === 'image' && m.file_url && <img src={resolveMediaUrl(m.file_url)} alt={m.file_name??'Shared image'} className="max-h-72 w-full object-cover" />}
          {!m.deleted && !m.view_once && m.type === 'voice' && m.file_url && <audio controls src={resolveMediaUrl(m.file_url)} className="w-full" />}
          {!m.deleted && !m.view_once && m.type === 'file' && m.file_url && (
            <a className="file-message" href={resolveMediaUrl(m.file_url)} target="_blank" rel="noreferrer">
              <FileText className="h-5 w-5 shrink-0 text-cyan" />
              <div className="min-w-0 flex-1">
                <p className="file-message__name">{m.file_name ?? m.content ?? 'Attachment'}</p>
                <p className="file-message__meta">{[formatFileSize(m.file_size), m.mime_type].filter(Boolean).join(' / ') || 'Download file'}</p>
              </div>
              <Download className="h-4 w-4 shrink-0 text-muted" />
            </a>
          )}
          {!m.deleted && !!m.reactions?.length && (
            <div className="message-reactions">
              {m.reactions.map((reaction) => {
                const reactedByMe = reaction.senders.some((sender) => sender.sender_id === senderId);
                return (
                  <button
                    key={reaction.emoji}
                    className={`message-reaction ${reactedByMe ? 'message-reaction--mine' : ''}`}
                    onClick={() => toggleReaction(m, reaction.emoji)}
                    disabled={!isJoined || !!reactionBusyIds[`${m.id}:${reaction.emoji}`]}
                    aria-label={`${reactionName(reaction.emoji)}, ${reaction.count} reactions`}
                    title={reaction.senders.map((sender) => sender.sender_name).join(', ')}
                  >
                    <ReactionIcon value={reaction.emoji}/>
                    <span>{reaction.count}</span>
                  </button>
                );
              })}
            </div>
          )}
          {m.created_at && <time className="message-time" dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time>}
        </article></SwipeableMessage>)}
        </div>
      </section></div>

      <div className="chat-activity" aria-label="Chat activity">
        <div className={`typing-region ${typingNames.length ? 'is-visible' : ''}`} aria-live="polite">{typingNames.length > 0 && <LoadingSignal label={typingLabel} />}</div>

        <span className="sr-only" role="status">{transcript.unread ? `${transcript.unread} new messages` : ''}</span>
      </div>

    {isJoined && reactionTarget && !reactionTarget.deleted && (
      <div className="reaction-dock">
        <div className="reaction-dock__context">
          <SmilePlus className="h-4 w-4 text-cyan" />
          <div className="min-w-0">
            <p className="reaction-dock__label">Reacting to {reactionTarget.sender_id === senderId ? 'you' : (reactionTarget.sender_name ?? 'member')}</p>
            <p className="reaction-dock__preview">{quoteLabel(reactionTarget)}</p>
          </div>
        </div>
        <div className="reaction-dock__emojis">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="reaction-picker-button"
              onClick={() => toggleReaction(reactionTarget, emoji)}
              disabled={!!reactionBusyIds[`${reactionTarget.id}:${emoji}`]}
              aria-label={`React ${reactionName(emoji)}`}
              type="button"
            >
              <ReactionIcon value={emoji}/>
            </button>
          ))}
        </div>
        <button className="reaction-dock__close" onClick={() => setReactionPickerMessageId(null)} aria-label="Close reactions" type="button">
          <X className="h-4 w-4" />
        </button>
      </div>
    )}

    <footer className="chat-composer neo-panel z-10 shrink-0 p-2">
      <div className="grid gap-2">
        {replyingTo && (
          <div className="composer-reply">
            <div className="min-w-0">
              <p className="composer-reply__label">Replying to {replyingTo.sender_id === senderId ? 'you' : (replyingTo.sender_name ?? 'member')}</p>
              <p className="composer-reply__content">{quoteLabel(replyingTo)}</p>
            </div>
            <button className="message-delete-button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" title="Cancel reply">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <textarea
          ref={composerRef}
          aria-label="Message"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          className="min-h-10 w-full resize-none border-2 border-accent bg-bg px-3 py-2 text-sm text-text outline-none focus:border-cyan disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14"
          placeholder={isJoined ? 'Type a transmission' : 'Join this channel to send'}
          disabled={!isJoined || recordingVoice}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {attachment && <AttachmentPreview attachment={attachment} remove={()=>setAttachment(null)} send={()=>void sendAttachment()} disabled={!isJoined || !connected || recordingVoice}/> }
        {recordingVoice && (
          <div className="voice-recording-strip">
            <div className="flex min-w-0 items-center gap-2">
              <span className="voice-recording-dot" />
              <span className="truncate">Recording voice transmission</span>
            </div>
            <span className="code-font text-punch">{recordingTime}</span>
          </div>
        )}
        <div className="composer-options mb-2 flex flex-wrap items-center gap-3 text-xs"><label className="flex min-h-11 items-center gap-2"><span className="composer-options__label">Message lifetime</span><select aria-label="Message lifetime" value={ttlSeconds} onChange={e=>setTtlSeconds(Number(e.target.value))} disabled={!isJoined||recordingVoice} className="min-h-11 border border-accent bg-bg px-2"><option value={0}>Room lifetime</option><option value={60}>1 minute</option><option value={300}>5 minutes</option><option value={3600}>1 hour</option><option value={86400}>24 hours</option></select></label><ToggleSwitch label="View once" aria-label="View-once attachments" checked={viewOnce} onChange={e=>setViewOnce(e.target.checked)} disabled={!isJoined||recordingVoice}/></div>
        <div className="composer-actions">
          <button
            className={`composer-action-button composer-action-button--burn ${burnAfterReadMode ? 'is-burning' : ''}`}
            onClick={() => setBurnAfterReadMode((value) => !value)}
            disabled={!isJoined || recordingVoice}
            type="button"
            aria-label="Burn after reading"
            title={burnAfterReadMode ? 'Destroy 60 seconds after seen' : 'Burn mode off'}
            aria-pressed={burnAfterReadMode}
          >
            <Flame className="h-4 w-4" />
            <span className="composer-label">{burnAfterReadMode ? 'Burn on' : 'Burn off'}</span>
          </button>
          <button type="button" className="composer-action-button mobile-attachment-action" aria-label="Choose attachment" disabled={!isJoined || recordingVoice || uploadingImage || uploadingFile} onClick={()=>setAttachmentSheet(true)}><Paperclip className="h-4 w-4"/></button>
          <label className={`composer-action-button composer-action-button--image ${uploadingImage || !isJoined || recordingVoice ? 'composer-control-disabled' : ''} ${uploadingImage ? 'cursor-wait opacity-70' : isJoined && !recordingVoice ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
            <ImagePlus className="h-4 w-4" />
            <span className="composer-label">{uploadingImage ? 'Uploading' : 'Image'}</span>
            <input
              id="chat-image-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Attach image"
              disabled={uploadingImage || !isJoined || recordingVoice}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) selectAttachment(file,'image');
                e.currentTarget.value = '';
              }}
            />
          </label>
          <label className={`composer-action-button composer-action-button--file ${uploadingFile || !isJoined || recordingVoice ? 'composer-control-disabled' : ''} ${uploadingFile ? 'cursor-wait opacity-70' : isJoined && !recordingVoice ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
            <Paperclip className="h-4 w-4" />
            <span className="composer-label">{uploadingFile ? 'Uploading' : 'File'}</span>
            <input
              id="chat-file-input"
              type="file"
              accept=".pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,text/csv,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="sr-only"
              aria-label="Attach file"
              disabled={uploadingFile || !isJoined || recordingVoice}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) selectAttachment(file,'file');
                e.currentTarget.value = '';
              }}
            />
          </label>
          <button
            className={`composer-action-button composer-action-button--voice ${recordingVoice ? 'is-recording' : ''}`}
            onClick={recordingVoice ? stopVoiceRecording : startVoiceRecording}
            aria-label={callIsActive(voiceView.phase) ? 'Voice recording unavailable during a call' : 'Record voice message'}
            disabled={!isJoined || uploadingVoice || callIsActive(voiceView.phase)}
          >
            {recordingVoice ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            <span className="composer-label">{recordingVoice ? 'Stop' : uploadingVoice ? 'Uploading' : 'Voice'}</span>
          </button>
          <Button className="composer-send-button" aria-label="Send message" onClick={send} disabled={!isJoined || recordingVoice || !text.trim()}>
            <Send className="h-4 w-4" />
            <span className="composer-label">Send</span>
          </Button>
        </div>
      </div>
    </footer>
    </section>

    <aside className="chat-context neo-panel hidden min-h-0 min-w-0 overflow-y-auto p-3 xl:block">
        <div className="desktop-session-controls"><Link to={profile?'/dashboard':'/'} aria-label="NullChannel home"><Brand/></Link><p className="nc-eyebrow">Session controls</p>
          {room.creator_id !== senderId && (
            <Button className={!isJoined ? 'bg-accent text-bg' : ''} onClick={isJoined ? leaveRoom : () => joinCurrentRoom()} disabled={(joinBusy && !isJoined) || leaveBusy}>
              <DoorOpen className="mr-2 inline h-4 w-4" />
              {leaveBusy ? <LoadingSignal label="Leaving" /> : isJoined ? 'Leave Room' : (joinBusy ? <LoadingSignal label="Joining" /> : 'Join Room')}
            </Button>
          )}
          <ThemeToggle />
          <CopyButton value={room.code} label="Copy Channel ID" onCopied={()=>showToast('Channel ID copied')} onError={showToast}/>
          <CopyButton value={publicAppUrl(window.location.href)} label="Copy Invite Link" onCopied={()=>showToast('Invite link copied')} onError={showToast}/>
          <Button onClick={() => nav(profile?'/dashboard':'/')}><House className="mr-2 inline h-4 w-4" />Home</Button>
          {room.creator_id === senderId && (
            <Button
              className="border-cyan text-cyan"
              onClick={() => { closeMenu(); setExtendModalOpen(true); }}
              disabled={!!room.expiry_extended || !!extendBusy}
              title={room.expiry_extended ? 'This channel has already been extended' : 'Extend expiry'}
            >
              <TimerReset className="mr-2 inline h-4 w-4" />
              {extendBusy ? <LoadingSignal label="Extending" /> : 'Extend'}
            </Button>
          )}
          {room.creator_id === senderId && <Button className="border-punch text-punch" onClick={panicWipeRoom} disabled={wipeBusy}><Siren className="mr-2 inline h-4 w-4" />{wipeBusy ? <LoadingSignal label="Wiping" /> : 'Panic Wipe'}</Button>}
          {room.creator_id === senderId && <Button className="border-punch text-punch" onClick={terminateRoom} disabled={terminateBusy}><Power className="mr-2 inline h-4 w-4" />{terminateBusy ? <LoadingSignal label="Terminating" /> : 'Terminate'}</Button>}
        </div>
      <div className="mb-5 border-b-2 border-accent/40 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="code-font flex items-center gap-2 text-xs tracking-[0.2em] text-cyan"><Radio className="h-4 w-4" />PARTICIPANTS</p>
          <span className="border border-cyan px-2 py-1 text-[10px] uppercase tracking-wider text-muted">{participants.filter(member => member.online).length} Online</span>
        </div>
        <div className="mt-3 grid gap-2">
          {participantsLoading && <RoomLoadingRows />}
          {!participantsLoading && participants.length === 0 && <p className="text-sm text-muted">No active participants yet.</p>}
          {!participantsLoading && participants.map((participant) => (
            <div key={participant.sender_id} className={`border-2 px-3 py-2 text-sm ${participant.sender_id === senderId ? 'border-cyan bg-cyan/10' : 'border-accent/60 bg-panel'}`}>
              <p className="font-semibold uppercase">{participant.sender_id === senderId ? `${participant.sender_name} (You)` : participant.sender_name}</p>
              <p className="code-font mt-1 text-[10px] uppercase tracking-[0.14em] text-muted">{participant.sender_id === room.creator_id ? 'Creator' : 'Member'}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mb-5 border-b-2 border-accent/40 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="code-font flex items-center gap-2 text-xs tracking-[0.2em] text-cyan"><Images className="h-4 w-4" />IMAGE GALLERY</p>
          <span className="border border-cyan px-2 py-1 text-[10px] uppercase tracking-wider text-muted">{imageMessages.length} Images</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {imageMessages.length === 0 && <p className="col-span-3 text-sm text-muted">No shared images yet.</p>}
          {imageMessages.slice(-9).reverse().map((message) => (
            <a key={`gallery-${message.id}`} href={resolveMediaUrl(message.file_url??'')} target="_blank" rel="noreferrer" className="gallery-thumb">
              <img src={resolveMediaUrl(message.file_url??'')} alt={message.content ?? 'Shared image'} />
            </a>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="code-font flex items-center gap-2 text-xs tracking-[0.2em] text-cyan"><Rows2 className="h-4 w-4" />RECENT ACTIVE ROOMS</p>
        {roomsLoading && <LoadingSignal label="Syncing" className="code-font text-[10px] uppercase tracking-[0.14em] text-muted" />}
      </div>
      <div className="mt-3 grid gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-muted">Recent Private</p>
          <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-1">
            {roomsLoading && <RoomLoadingRows />}
            {!roomsLoading && myRooms.filter((r) => (r.room_type ?? 'private') === 'private').length === 0 && <p className="text-sm text-muted">No active private rooms.</p>}
            {myRooms.filter((r) => (r.room_type ?? 'private') === 'private').map((r) => (
              <button key={`p-${r.code}`} onClick={() => nav(`/chat/${r.code}`)} className={`neo-action w-[220px] shrink-0 border-2 px-3 py-2 text-left text-sm sm:w-full ${r.code === room.code ? 'border-cyan bg-cyan/10' : 'border-accent/60 bg-panel hover:border-cyan'}`}>
                <p className="code-font tracking-widest">{r.code}</p>
                <p className="text-xs text-muted">{r.room_name ?? 'Private Room'}</p>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-muted">Recent Groups</p>
          <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-1">
            {roomsLoading && <RoomLoadingRows />}
            {!roomsLoading && myRooms.filter((r) => (r.room_type ?? 'private') === 'group').length === 0 && <p className="text-sm text-muted">No active groups.</p>}
            {myRooms.filter((r) => (r.room_type ?? 'private') === 'group').map((r) => (
              <button key={`g-${r.code}`} onClick={() => nav(`/chat/${r.code}`)} className={`neo-action w-[220px] shrink-0 border-2 px-3 py-2 text-left text-sm sm:w-full ${r.code === room.code ? 'border-cyan bg-cyan/10' : 'border-accent/60 bg-panel hover:border-cyan'}`}>
                <p className="code-font tracking-widest">{r.code}</p>
                <p className="text-xs text-muted">{r.room_name ?? 'Group Room'}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
    {!!toast && (
      <div className="copy-toast code-font fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 text-xs uppercase tracking-[0.18em]">
        {toast}
      </div>
    )}
  </main>;
}

const RoomLoadingRows = () => (
  <>
    <div className="loading-row h-[58px] w-[220px] shrink-0 sm:w-full" />
    <div className="loading-row h-[58px] w-[220px] shrink-0 sm:w-full" />
  </>
);
