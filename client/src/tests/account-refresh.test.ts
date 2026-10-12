// @vitest-environment jsdom
import axios,{AxiosError} from 'axios';
import {afterEach,it,expect,vi} from 'vitest';
import {accountApi} from '../lib/account';
const original=accountApi.defaults.adapter;
afterEach(()=>{accountApi.defaults.adapter=original;vi.restoreAllMocks();});
const failure=(status:number,config:unknown)=>new AxiosError('Request unavailable',undefined,config as never,undefined,{status,data:{},config,headers:{},statusText:''} as never);
it.each([403,429,500,502,503])('does not interpret refresh %s as expired credentials',async status=>{
 const listener=vi.fn();window.addEventListener('nullchannel-account-expired',listener);
 accountApi.defaults.adapter=async config=>{throw failure(config.url==='/account/refresh'?status:401,config);};
 await expect(accountApi.get('/protected')).rejects.toSatisfy(axios.isAxiosError);expect(listener).not.toHaveBeenCalled();window.removeEventListener('nullchannel-account-expired',listener);
});
it('clears confirmed invalid refresh credentials but never replays explicit logout',async()=>{
 const listener=vi.fn();window.addEventListener('nullchannel-account-expired',listener);const calls:string[]=[];
 accountApi.defaults.adapter=async config=>{calls.push(config.url!);throw failure(401,config);};
 await expect(accountApi.get('/protected')).rejects.toThrow();expect(listener).toHaveBeenCalledOnce();calls.length=0;await expect(accountApi.post('/account/logout')).rejects.toThrow();expect(calls).toEqual(['/account/logout']);window.removeEventListener('nullchannel-account-expired',listener);
});

it('waits for an in-flight refresh before issuing explicit logout',async()=>{
 const calls:string[]=[];let release!:()=>void;let refreshed=false;
 accountApi.defaults.adapter=async config=>{calls.push(config.url!);if(config.url==='/account/refresh'){await new Promise<void>(resolve=>{release=resolve;});refreshed=true;}else if(config.url==='/protected'&&!refreshed||config.url==='/account/me')throw failure(401,config);return {data:{success:true},status:200,statusText:'OK',headers:{},config};};
 const protectedRequest=accountApi.get('/protected');await vi.waitFor(()=>expect(calls).toContain('/account/refresh'));const logout=accountApi.post('/account/logout');await Promise.resolve();await Promise.resolve();expect(calls).not.toContain('/account/logout');release();await Promise.all([protectedRequest,logout]);expect(calls.indexOf('/account/logout')).toBeGreaterThan(calls.indexOf('/account/refresh'));expect(calls.filter(path=>path==='/account/refresh')).toHaveLength(1);
});
