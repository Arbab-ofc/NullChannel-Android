import { useId } from 'react';
/** Original scalable orbit sticker. No network image or private conversation data. */
export function SignalArt({className=''}:{className?:string}) {
  const id=useId().replaceAll(':','');
  return <svg className={`signal-art ${className}`} viewBox="0 0 480 400" fill="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="80" y1="80" x2="380" y2="340" gradientUnits="userSpaceOnUse"><stop stopColor="currentColor"/><stop offset="1" stopColor="currentColor" stopOpacity=".28"/></linearGradient></defs>
    <ellipse cx="240" cy="200" rx="211" ry="85" transform="rotate(-28 240 200)" stroke="currentColor" strokeOpacity=".35"/>
    <ellipse cx="240" cy="200" rx="211" ry="85" transform="rotate(28 240 200)" stroke="currentColor" strokeOpacity=".2"/>
    <path d="M137 123c28-30 75-24 96 7l54 80c12 18 38 21 54 6 22-21 4-58-26-54l-36 5-32-48 47-8c76-14 126 79 70 132-40 38-103 30-133-15l-54-81c-11-16-34-19-48-5-19 18-3 50 23 46l36-5 32 48-46 8c-71 13-119-72-67-126Z" fill={`url(#${id})`} stroke="currentColor" strokeWidth="2"/>
    <circle cx="75" cy="263" r="10" fill="currentColor"/><circle cx="407" cy="125" r="6" fill="currentColor"/>
    <path d="m372 296 6 15 16 6-16 6-6 16-6-16-16-6 16-6 6-15Z" fill="currentColor"/>
    <path d="M78 101v24m-12-12h24" stroke="currentColor" strokeWidth="2"/>
  </svg>;
}
