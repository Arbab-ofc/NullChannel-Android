export function Brand({compact=false}:{compact?:boolean}) {
  return <span className="nc-brand"><img src="/favicon.svg" width="30" height="30" alt="" />{!compact && <span>NullChannel<span className="nc-brand__dot" aria-hidden="true">.</span></span>}</span>;
}
