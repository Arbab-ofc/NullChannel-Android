import { useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';
export function dateLabel(value: string, now = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {day:'numeric',month:'long',year:'numeric'});
}
export function FloatingDateSeparator({element, revision}: {element: HTMLElement|null; revision: unknown}) {
  const [date,setDate] = useState('');
  useEffect(() => {
    if (!element || !('IntersectionObserver' in window)) return;
    if(!element.querySelector('[data-message-date]'))setDate('');
    const visible = new Map<HTMLElement, number>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) { const node = entry.target as HTMLElement; if (entry.isIntersecting) visible.set(node,entry.boundingClientRect.top); else visible.delete(node); }
      const first = [...visible.keys()].sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1)[0];
      setDate(first?.dataset.messageDate ?? '');
    }, {root:element, threshold:0, rootMargin:'0px'});
    element.querySelectorAll<HTMLElement>('[data-message-date]').forEach(node=>observer.observe(node));
    return ()=>observer.disconnect();
  },[element,revision]);
  return date ? <div className="floating-date" aria-hidden="true">{dateLabel(date)}</div> : null;
}
export function JumpToLatest({visible, unread, onClick}: {visible:boolean;unread:number;onClick:()=>void}) {
  return visible || unread > 0 ? <button type="button" className="jump-latest" onClick={onClick} aria-label={`Jump to latest${unread ? `, ${unread} new messages` : ''}`}><ArrowDown aria-hidden="true"/>{unread > 0 && <span>{unread}</span>}</button> : null;
}
