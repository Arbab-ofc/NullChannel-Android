import {useId} from 'react';
import {Sun,Moon,Monitor} from 'lucide-react';
import {useTheme} from '../../hooks/useTheme';
import '../../styles/stability.css';
const choices=[['light','Light',Sun],['dark','Dark',Moon],['oled','OLED',Monitor]] as const;
export const ThemeToggle=()=>{
 const {theme,setTheme}=useTheme();const id=useId();
 return <fieldset className="theme-segments" aria-label="Color theme"><legend className="sr-only">Appearance</legend>{choices.map(([value,label,Icon])=><label key={value} data-selected={theme===value}><input type="radio" name={id} value={value} checked={theme===value} onChange={()=>setTheme(value)}/><Icon aria-hidden="true"/><span>{label}</span></label>)}</fieldset>;
};
