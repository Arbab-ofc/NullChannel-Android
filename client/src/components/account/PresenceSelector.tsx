import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Ghost, Moon } from 'lucide-react';
import '../../styles/presence-selector.css';

export type PresenceStatus = 'online' | 'away' | 'invisible';

const statuses: Array<{ value: PresenceStatus; label: string; icon: 'online' | 'away' | 'invisible' }> = [
  { value: 'online', label: 'Online', icon: 'online' },
  { value: 'away', label: 'Away', icon: 'away' },
  { value: 'invisible', label: 'Invisible', icon: 'invisible' }
];

export function PresenceSelector({ value, onChange }: { value: PresenceStatus; onChange: (value: PresenceStatus) => void }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<PresenceStatus>(value);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }, []);
  const openMenu = () => { setActive(value); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open || !root.current || !listbox.current) return;
    listbox.current.focus({ preventScroll: true });
    const anchor = root.current.getBoundingClientRect();
    const menu = listbox.current;
    const margin = 12;
    const menuWidth = Math.min(Math.max(anchor.width, 188), window.innerWidth - margin * 2);
    const menuHeight = Math.min(menu.scrollHeight, window.innerHeight - margin * 2);
    const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - menuWidth - margin));
    const below = window.innerHeight - anchor.bottom - margin;
    const top = below >= Math.min(menu.scrollHeight, 180) ? anchor.bottom + 8 : Math.max(margin, anchor.top - menuHeight - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.width = `${menuWidth}px`;
    menu.style.maxHeight = `${menuHeight}px`;
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const anchor = root.current?.getBoundingClientRect();
      const menu = listbox.current;
      if (!anchor || !menu) return;
      const margin = 12;
      const width = Math.min(Math.max(anchor.width, 188), window.innerWidth - margin * 2);
      const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
      const height = Math.min(menu.scrollHeight, window.innerHeight - margin * 2);
      const below = window.innerHeight - anchor.bottom - margin;
      menu.style.left = `${left}px`;
      menu.style.top = `${below >= Math.min(menu.scrollHeight, 180) ? anchor.bottom + 8 : Math.max(margin, anchor.top - height - 8)}px`;
      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${height}px`;
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); };
  }, [open]);

  const select = (next: PresenceStatus) => { onChange(next); close(true); };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = statuses.findIndex(status => status.value === active);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      setActive(statuses[(index + offset + statuses.length) % statuses.length].value);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); setActive(statuses[event.key === 'Home' ? 0 : statuses.length - 1].value);
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(active); }
  };
  const current = statuses.find(status => status.value === value) ?? statuses[0];
  const CurrentIcon = current.icon === 'away' ? Moon : current.icon === 'invisible' ? Ghost : null;

  return <div className="presence-selector" ref={root}>
    <span className="presence-selector__label" id={`${id}-label`}>Presence</span>
    <button ref={trigger} className="presence-selector__trigger" type="button" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-listbox`} onClick={() => open ? close() : openMenu()} onKeyDown={event => {
      if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openMenu(); }
    }}>
      <span className={`presence-selector__indicator presence-selector__indicator--${value}`} aria-hidden="true">{CurrentIcon && <CurrentIcon size={12}/>}</span>
      <span id={`${id}-value`}>{current.label}</span><span className="presence-selector__chevron" aria-hidden="true"/>
    </button>
    {open && <div ref={listbox} id={`${id}-listbox`} className="presence-selector__menu" role="listbox" aria-labelledby={`${id}-label`} aria-activedescendant={`${id}-${active}`} tabIndex={0} onKeyDown={handleKeyDown}>
      {statuses.map(status => {
        const Icon = status.icon === 'away' ? Moon : status.icon === 'invisible' ? Ghost : null;
        return <div key={status.value} className={`presence-selector__option${active === status.value ? ' is-active' : ''}`} role="option" aria-selected={value === status.value} id={`${id}-${status.value}`} onMouseEnter={() => setActive(status.value)} onClick={() => select(status.value)}>
          <span className={`presence-selector__indicator presence-selector__indicator--${status.value}`} aria-hidden="true">{Icon && <Icon size={12}/>}</span>
          <span className="presence-selector__option-label">{status.label}</span>
          {value === status.value && <Check className="presence-selector__check" size={16} aria-hidden="true"/>}
        </div>;
      })}
    </div>}
  </div>;
}
