export function ExperimentalMenuButton({open,controls,onClick}:{open:boolean;controls:string;onClick:()=>void}) {
 return <button type="button" className={`experimental-menu ${open?'is-open':''}`} aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} aria-controls={controls} onClick={onClick}><span aria-hidden="true"><i/><i/><i/></span></button>;
}
