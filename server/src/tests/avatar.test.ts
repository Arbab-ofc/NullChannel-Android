import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {Express} from 'express';
const {insert,upload,rpc,from,listFiles,chain}=vi.hoisted(()=>{const chain:Record<string,ReturnType<typeof vi.fn>>={};for(const method of ['select','eq','maybeSingle','delete','update','upsert'])chain[method]=vi.fn(()=>chain);chain.then=vi.fn((resolve:(value:unknown)=>void)=>resolve({data:null,error:null}));return{insert:vi.fn(),upload:vi.fn(),rpc:vi.fn(),from:vi.fn(()=>chain),listFiles:vi.fn(),chain};});
vi.mock('../config/supabase.js',()=>({supabase:{from,rpc}}));
vi.mock('../config/imagekit.js',()=>({imagekit:{upload,listFiles}}));
vi.mock('../utils/logger.js',()=>({logger:{error:vi.fn()}}));
import {avatarUrl,validAvatar,uploadAvatar,recoverAvatarIntents} from '../services/avatar.service.js';
const file=(mime:string,buffer:Buffer,size=buffer.length)=>({mimetype:mime,buffer,size} as Express.Multer.File);
beforeEach(()=>{vi.clearAllMocks();chain.insert=insert;insert.mockResolvedValue({error:null});upload.mockResolvedValue({fileId:'provider-id',filePath:'/provider/path'});rpc.mockResolvedValue({error:null});});
describe('persistent avatar lifecycle',()=>{
 it('rejects unsupported MIME, invalid signatures and oversize input',()=>{expect(validAvatar(file('image/png',Buffer.from('not png')))).toBe(false);expect(validAvatar(file('image/svg+xml',Buffer.from('<svg/>')))).toBe(false);expect(validAvatar(file('image/png',Buffer.from('89504e470d0a1a0a','hex'),3*1024*1024))).toBe(false);expect(validAvatar(file('image/png',Buffer.from('89504e470d0a1a0a','hex')))).toBe(true);});
 it('publishes an authorized backend URL without file IDs',()=>expect(avatarUrl('shadow482','provider-id')).toBe('/api/account/avatars/shadow482'));
 it('records a durable intent before upload and commits privately',async()=>{await uploadAvatar('verified-account',file('image/png',Buffer.from('89504e470d0a1a0a','hex')));expect(insert.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);expect(upload).toHaveBeenCalledWith(expect.objectContaining({isPrivateFile:true,useUniqueFileName:false}));expect(rpc).toHaveBeenCalledWith('commit_profile_avatar',expect.objectContaining({p_account:'verified-account',p_file_id:'provider-id'}));});
 it('does not upload if durable intent creation fails',async()=>{insert.mockResolvedValue({error:new Error('database unavailable')});await expect(uploadAvatar('account',file('image/png',Buffer.from('89504e470d0a1a0a','hex')))).rejects.toThrow('database unavailable');expect(upload).not.toHaveBeenCalled();});
 it('preserves a recovery intent when a provider write succeeds but commit fails',async()=>{rpc.mockResolvedValue({error:new Error('commit unavailable')});await expect(uploadAvatar('account',file('image/png',Buffer.from('89504e470d0a1a0a','hex')))).rejects.toThrow('commit unavailable');expect(chain.delete).not.toHaveBeenCalled();});
 it('records backoff if provider intent reconciliation fails',async()=>{rpc.mockResolvedValue({data:[{id:'intent',file_path:'/profiles/file.png',attempts:1}],error:null});listFiles.mockRejectedValue(new Error('provider down'));await recoverAvatarIntents();expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({attempts:2,lease_until:null}));expect(chain.delete).not.toHaveBeenCalled();});
});
