import { useState } from 'react';
import { ArrowUpRight, RotateCcw, Timer, Radio } from 'lucide-react';
import { Button } from './Button';
const scenes = [
  ['Ghost_204', 'Late-night ideas', 'What would you make if nobody was watching?', 'Something a little unexpected.', 'Same. Let’s start there.'],
  ['Ghost_817', 'A fresh conversation', 'A new room. A clean slate.', 'And the same friends on the other side.', 'Connections stay. This conversation won’t.']
];
export function ProductPreview() {
  const [scene,setScene]=useState(0);
  const [name,title,first,second,third]=scenes[scene];
  return <section className="product-preview" aria-label="Interactive product preview">
    <div className="product-preview__caption"><span>Product preview · sample conversation</span><ArrowUpRight aria-hidden="true" size={15}/></div>
    <div className="product-preview__header"><span className="preview-avatar"><Radio aria-hidden="true"/></span><div><strong>{title}</strong><p>Temporary private room</p></div><span className="preview-expiry"><Timer aria-hidden="true" size={14}/> 15 min</span></div>
    <div className="product-preview__messages" key={scene} aria-live="polite"><p className="preview-room-note">A little less history. A little more here.</p><div className="preview-message"><span>{name}</span><p>{first}</p></div><div className="preview-message preview-message--self"><span>You</span><p>{second}</p></div><div className="preview-message"><span>{name}</span><p>{third}</p></div></div>
    <div className="product-preview__footer"><span>A fresh session for every direct conversation.</span><Button variant="ghost" onClick={()=>setScene(value=>(value+1)%scenes.length)} aria-label="Preview a fresh conversation"><RotateCcw aria-hidden="true"/></Button></div>
  </section>;
}
