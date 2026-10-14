import {describe,it,expect} from 'vitest';
import {CallDelivery} from '../services/call-delivery.js';
describe('bounded call signaling delivery',()=>{
 it('serializes duplicate retries, executes once, and rejects ID reuse with changed data',async()=>{
  const journal=new CallDelivery();let executions=0;
  const invoke=(data:object)=>journal.run(()=>journal.once('caller','id','call:offer',data,async()=>{executions++;return {ok:true};}));
  const result=await Promise.all([invoke({revision:1}),invoke({revision:1})]);expect(result).toEqual([{ok:true},{ok:true}]);expect(executions).toBe(1);
  await expect(invoke({revision:2})).rejects.toThrow('REPLAY');
 });
 it('only replays to the intended participant and discards acknowledged/stale revisions',()=>{
  const journal=new CallDelivery();journal.add({signalId:'a',event:'call:offer',target:'callee',revision:1,data:{}});journal.add({signalId:'b',event:'call:answer',target:'caller',revision:2,data:{}});
  expect(journal.replay('caller',2).map(signal=>signal.signalId)).toEqual(['b']);
  journal.acknowledge('caller','a');expect(journal.replay('callee',1)).toHaveLength(1);
  journal.acknowledge('callee','a');expect(journal.replay('callee',1)).toHaveLength(0);
 });
 it('bounds replay memory when a peer never acknowledges',()=>{const journal=new CallDelivery();for(let i=0;i<512;i++)journal.add({signalId:String(i),event:'call:ice-candidate',target:'callee',revision:1,data:{}});expect(()=>journal.add({signalId:'overflow',event:'call:offer',target:'callee',revision:2,data:{}})).toThrow('BACKLOG');journal.clear();expect(journal.replay('callee',0)).toEqual([]);});
});
