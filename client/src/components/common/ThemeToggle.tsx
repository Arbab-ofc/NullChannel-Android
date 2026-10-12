import {useId,useRef} from 'react';
import {Sun,Moon,Contrast,Check} from 'lucide-react';
import {useTheme} from '../../hooks/useTheme';
import type {Theme} from '../../lib/theme';
const choices=[['light','Light',Sun],['dark','Dark',Moon],['oled','OLED',Contrast]] as const;
export const ThemeToggle=()=>{
 const {theme,setTheme}=useTheme();const ref=useRef<HTMLDetailsElement>(null);const id=useId();const Icon=theme==='light'?Sun:theme==='oled'?Contrast:Moon;
 return <details ref={ref} className="theme-picker" onKeyDown={event=>{if(event.key==='Escape'&&ref.current?.open){event.preventDefault();event.stopPropagation();ref.current.open=false;ref.current?.querySelector('summary')?.focus();}}}>
  <summary className="theme-toggle" aria-label="Choose color theme" title={`Current theme: ${theme}`}><Icon aria-hidden="true"/></summary>
  <fieldset className="theme-options"><legend>Appearance</legend>{choices.map(([value,label,ChoiceIcon])=><label key={value}><input type="radio" name={id} value={value} checked={theme===value} onChange={()=>{setTheme(value as Theme);ref.current!.open=false;ref.current?.querySelector('summary')?.focus({preventScroll:true});}}/><ChoiceIcon aria-hidden="true"/><span>{label}</span>{theme===value&&<Check aria-hidden="true"/>}</label>)}</fieldset>
 </details>;
};
