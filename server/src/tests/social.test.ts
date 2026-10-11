import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../config/env.js',()=>({env:{FRIEND_REQUEST_TTL_DAYS:7}}));
vi.mock('../services/avatar.service.js',()=>({avatarUrl:()=>null}));
const {from,rpc,responses}=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),responses:[] as unknown[]}));
vi.mock('../config/supabase.js',()=>({supabase:{from,rpc}}));
import {eligibleProfile,socialAction} from '../services/social.service.js';
beforeEach(()=>{responses.length=0;vi.clearAllMocks();from.mockImplementation(()=>{const response=responses.shift();const chain:Record<string,unknown>={then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(response).then(resolve)};for(const key of ['select','eq','or','single'])chain[key]=vi.fn(()=>chain);return chain;});});
describe('social privacy boundary',()=>{
 it('conceals blocked profiles before reading profile metadata',async()=>{responses.push({data:[{blocker_id:'viewer',blocked_id:'target'}],error:null});expect(await eligibleProfile('viewer','target',true)).toBeNull();expect(from).toHaveBeenCalledTimes(1);});
 it('conceals undiscoverable accounts from username search',async()=>{responses.push({data:[],error:null},{data:[],error:null},{data:{discoverability:'nobody',profile_visibility:'registered'},error:null});expect(await eligibleProfile('viewer','target',true)).toBeNull();expect(from).toHaveBeenCalledTimes(3);});
 it('returns only username for a private permitted interaction',async()=>{responses.push({data:[],error:null},{data:[],error:null},{data:{discoverability:'registered',profile_visibility:'private'},error:null},{data:{username:'shadow482',display_name:'Secret',bio:'Private bio',avatar_url:'private-avatar'},error:null});const profile=await eligibleProfile('viewer','target');expect(profile).toEqual({username:'shadow482'});expect(JSON.stringify(profile)).not.toContain('Secret');});
 it('does not pass through raw database errors from relationship actions',async()=>{rpc.mockResolvedValue({data:null,error:{message:'sensitive SQL internal context'}});const result=await socialAction('verified-actor','target','accept','request');expect(result).toEqual({error:true,data:null});expect(JSON.stringify(result)).not.toContain('SQL');expect(rpc).toHaveBeenCalledWith('social_action',{p_actor:'verified-actor',p_target:'target',p_action:'accept',p_request:'request',p_ttl_days:7});});
});
