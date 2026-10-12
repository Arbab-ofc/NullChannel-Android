export function Skeleton({kind='rooms',label='Loading'}:{kind?:'rooms'|'messages'|'profile'|'notifications';label?:string}) {
 return <div className={`skeleton-layout skeleton-layout--${kind}`} role="status" aria-label={label}><span className="sr-only">{label}</span><div aria-hidden="true">{Array.from({length:kind==='profile'?3:4},(_,index)=><div className="skeleton-row" key={index}><span className="skeleton-avatar"/><div><span className="skeleton-line"/><span className="skeleton-line skeleton-line--short"/></div></div>)}</div></div>;
}
