import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { TranscriptScroll } from '../lib/transcript-scroll';
export const useTranscriptScroll = (messages: Array<{ id?: string }>, notices: unknown[], roomCode: string) => {
  const controller = useRef<TranscriptScroll | null>(null);
  const dispose = useRef<() => void>(() => undefined);
  const [away, setAway] = useState(false);
  const [unread, setUnread] = useState(0);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const ids = useRef<string[]>([]);
  ids.current = messages.flatMap(message => message.id ? [message.id] : []);
  const ref = useCallback((element: HTMLElement | null) => {
    dispose.current(); controller.current = null; setElement(element);
    if (!element) return;
    element.dataset.scrollRoom = roomCode;
    const scroll = new TranscriptScroll(element,setUnread,setAway); controller.current = scroll;
    element.addEventListener('scroll',scroll.onScroll,{ passive: true });
    element.addEventListener('pointerdown',scroll.interrupt,{passive:true});element.addEventListener('wheel',scroll.interrupt,{passive:true});
    const resize = new ResizeObserver(scroll.restore);
    resize.observe(element); if (element.firstElementChild) resize.observe(element.firstElementChild);
    dispose.current = () => { element.removeEventListener('scroll',scroll.onScroll);element.removeEventListener('pointerdown',scroll.interrupt);element.removeEventListener('wheel',scroll.interrupt); resize.disconnect(); };
    scroll.sync(ids.current);
    setUnread(0); setAway(false);
  // A room transition must release anchors and unread state from the previous transcript.
  },[roomCode]);
  useLayoutEffect(() => { controller.current?.sync(messages.flatMap(message => message.id ? [message.id] : [])); },[messages,notices]);
  const receive = useCallback((id: string, own: boolean) => controller.current?.beforeMessage(id,own),[]);
  const newest = useCallback(() => controller.current?.newest(!window.matchMedia('(prefers-reduced-motion: reduce)').matches),[]);
  return { ref,element,unread,away,receive,newest };
};
