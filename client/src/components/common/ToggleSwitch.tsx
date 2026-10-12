import {useId,type InputHTMLAttributes, type ReactNode} from 'react';
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'type'> & {label:ReactNode};
/** Native checkbox semantics and form serialization, with existing change handlers. */
export function ToggleSwitch({label,id,...props}:Props){const generated=useId();return <label className="toggle-switch" htmlFor={id??generated}><input {...props} id={id??generated} type="checkbox"/><span className="toggle-switch__track" aria-hidden="true"><span/></span><span>{label}</span></label>;}
