import {describe,it,expect,vi,beforeEach} from 'vitest';
const {from}=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('../config/supabase.js',()=>({supabase:{from}}));
vi.mock('../services/media.service.js',()=>({queueUnusedUpload:vi.fn()}));
import {listMessages} from '../services/message.service.js';
beforeEach(()=>vi.resetAllMocks());
describe('temporary history provider boundaries',()=>{
 it('retrieves messages across provider pages and bounds reaction query size',async()=>{
  const rows=Array.from({length:1001},(_,i)=>({id:`message-${i}`,room_id:'room',sender_id:'sender',type:'text',created_at:new Date(i).toISOString()}));
  const ranges:number[][]=[];const reactionSizes:number[]=[];
  from.mockImplementation((table:string)=>{
   const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),order:vi.fn(()=>query),range:vi.fn((a:number,b:number)=>{ranges.push([a,b]);return Promise.resolve({data:rows.slice(a,b+1),error:null});}),in:vi.fn((_key:string,ids:string[])=>{reactionSizes.push(ids.length);return Promise.resolve({data:[],error:null});})};
   expect(['messages','message_reactions']).toContain(table);return query;
  });
  const history=await listMessages('room');expect(history).toHaveLength(1001);expect(history.at(-1)?.id).toBe('message-1000');expect(ranges).toHaveLength(11);expect(Math.max(...reactionSizes)).toBeLessThanOrEqual(100);
 });
 it('does not interpret a page of expired messages as the end of history',async()=>{
  from.mockImplementation((table:string)=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:(offset:number)=>Promise.resolve({error:null,data:offset===0?Array.from({length:100},(_,i)=>({id:`expired-${i}`,burn_expires_at:'2000-01-01T00:00:00Z'})):[{id:'available',type:'text'}]}),in:()=>Promise.resolve({data:[],error:null})};expect(['messages','message_reactions']).toContain(table);return q;});
  expect((await listMessages('room')).map(m=>m.id)).toEqual(['available']);
 });
});
