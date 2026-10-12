import {useEffect,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {Illustration} from './Illustration';
/** Creation handlers opt in only after a successful response; no navigation delay. */
export function RoomCreatedFeedback(){const location=useLocation(),navigate=useNavigate();const [visible,setVisible]=useState(false);useEffect(()=>{if(!location.state?.roomCreated)return;setVisible(true);const {roomCreated:_,...state}=location.state;void _;navigate(location.pathname+location.search+location.hash,{replace:true,state});},[location.state,location.pathname,location.search,location.hash,navigate]);
 // Removing the router marker remounts the effect; keep a separate dismissal timer.
 useEffect(()=>{if(!visible)return;const timer=setTimeout(()=>setVisible(false),1800);return()=>clearTimeout(timer);},[visible]);
 return visible?<div className="room-created-feedback" role="status"><Illustration kind="success"/><span>Room created</span></div>:null;}
