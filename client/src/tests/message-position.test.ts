import {it,expect} from 'vitest';
import {placeMessageActions} from '../components/mobile/ResponsiveActions';
const rect=(left:number,top:number,right:number,bottom:number)=>({left,top,right,bottom} as DOMRect);
it('places above a message without intersecting its content',()=>{const r=rect(300,400,600,500),p=placeMessageActions(r,{width:190,height:140},{width:1024,top:0,bottom:700})!;expect(p.top+140).toBeLessThan(r.top);expect(p.left).toBeGreaterThanOrEqual(12);});
it('flips below a top message and beside a long message',()=>{expect(placeMessageActions(rect(100,10,300,100),{width:190,height:140},{width:1024,top:0,bottom:700})?.top).toBe(108);expect(placeMessageActions(rect(250,0,600,690),{width:190,height:140},{width:1024,top:0,bottom:700})?.left).toBe(52);});
it('uses a sheet fallback rather than covering a message or composer when no space fits',()=>{expect(placeMessageActions(rect(10,0,380,650),{width:190,height:140},{width:390,top:0,bottom:650})).toBeNull();});
