import { createHash } from 'node:crypto';
export type DeliveredSignal = { signalId: string; event: string; data: Record<string, unknown>; target: 'caller'|'callee'; revision: number };
/** Bounded, process-local delivery journal. It never persists SDP or candidates. */
export class CallDelivery {
  private receipts = new Map<string,{hash:string;result:unknown}>();
  private pending = new Map<string,DeliveredSignal>();
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(work:()=>Promise<T>):Promise<T>{const next=this.tail.catch(()=>undefined).then(work);this.tail=next;return next;}
  async once<T>(owner:string,id:string|undefined,event:string,data:object,work:()=>Promise<T>):Promise<T>{
    if(!id)return work();
    const key=`${owner}:${id}`, hash=createHash('sha256').update(event+JSON.stringify(data)).digest('hex');
    const old=this.receipts.get(key);if(old){if(old.hash!==hash)throw new Error('SIGNAL_REPLAY');return old.result as T;}
    if(this.receipts.size>=2048)this.receipts.delete(this.receipts.keys().next().value!);
    const result=await work();this.receipts.set(key,{hash,result});return result;
  }
  add(signal:DeliveredSignal){if(this.pending.size>=512)throw new Error('SIGNAL_BACKLOG');this.pending.set(signal.signalId,signal);}
  advanceRevision(revision:number){for(const [id,signal] of this.pending)if(signal.revision<revision)this.pending.delete(id);}
  acknowledge(role:'caller'|'callee',id:string){const signal=this.pending.get(id);if(signal?.target===role)this.pending.delete(id);}
  replay(role:'caller'|'callee',revision:number){return [...this.pending.values()].filter(item=>item.target===role&&item.revision>=revision);}
  exportState(){return {receipts:[...this.receipts].slice(-256),pending:[...this.pending]};}
  static restore(state:ReturnType<CallDelivery['exportState']>){const journal=new CallDelivery();journal.receipts=new Map(state.receipts);journal.pending=new Map(state.pending);return journal;}
  clear(){this.pending.clear();this.receipts.clear();}
}
