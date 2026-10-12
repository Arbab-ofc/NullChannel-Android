import {describe,it,expect,vi} from 'vitest';
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{refreshSession}})}));
vi.mock('../services/avatar.service.js',()=>({avatarUrl:()=>null}));
const {getUser,profileState,refreshSession}=vi.hoisted(()=>({getUser:vi.fn(),refreshSession:vi.fn(),profileState:{data:{deletion_pending:false} as {deletion_pending:boolean}|null,error:null as unknown}}));
vi.mock('../config/env.js',()=>({env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'},isProd:false}));
vi.mock('../config/supabase.js',()=>({supabase:{auth:{getUser},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>profileState})})})}}));
import {cookieValue,validUsername,validPassword,verifyAccountCookie,refreshAccountSession} from '../services/account.service.js';
describe('registered account boundary',()=>{
 it.each(['admin','SYSTEM','root','NullChannel','ab','with space','a'.repeat(25)])('rejects unavailable username %s',name=>expect(validUsername(name)).toBe(false));
 it.each(['shadow482','Ghost_926','abc'])('accepts valid username %s',name=>expect(validUsername(name)).toBe(true));
 it('enforces a long password policy',()=>{expect(validPassword('short')).toBe(false);expect(validPassword('a'.repeat(12))).toBe(true);expect(validPassword('a'.repeat(129))).toBe(false);});
 it('never adopts a client account UUID as authentication',async()=>{getUser.mockResolvedValue({data:{user:null},error:{message:'invalid token',status:401}});expect(await verifyAccountCookie('nc_account_access=client-id')).toBeNull();expect(getUser).toHaveBeenCalledWith('client-id');});
 it('requires server verified Supabase credentials',async()=>{getUser.mockResolvedValue({data:{user:{id:'verified-id'}},error:null});expect(await verifyAccountCookie('nc_account_access=ey.test.token')).toEqual({id:'verified-id'});expect(await verifyAccountCookie('nc_access=anonymous')).toBeNull();});
 it('blocks pending deletion sessions but allows explicit self/retry authorization',async()=>{getUser.mockResolvedValue({data:{user:{id:'pending-id'}},error:null});profileState.data={deletion_pending:true};expect(await verifyAccountCookie('nc_account_access=ey.test.token')).toBeNull();expect(await verifyAccountCookie('nc_account_access=ey.test.token',true)).toEqual({id:'pending-id'});profileState.data={deletion_pending:false};});
 it('rejects oversized or malformed cookie credentials',()=>{expect(cookieValue('nc_account_access='+ 'a'.repeat(9000),'nc_account_access')).toBeUndefined();expect(cookieValue('nc_account_access=bad%token','nc_account_access')).toBeUndefined();});
 it('keeps provider outages distinct from invalid sessions',async()=>{getUser.mockResolvedValue({data:{user:null},error:{status:503}});await expect(verifyAccountCookie('nc_account_access=ey.test.token')).rejects.toThrow('AUTH_UNAVAILABLE');});
 it('coalesces overlapping refresh-token rotations without retaining completed credentials',async()=>{
  let resolve!:(value:unknown)=>void;refreshSession.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const a=refreshAccountSession('fixture-refresh'),b=refreshAccountSession('fixture-refresh');expect(a).toBe(b);expect(refreshSession).toHaveBeenCalledOnce();resolve({data:{session:{}},error:null});await a;refreshSession.mockResolvedValueOnce({data:{session:{}},error:null});await refreshAccountSession('fixture-refresh');expect(refreshSession).toHaveBeenCalledTimes(2);
 });
});
