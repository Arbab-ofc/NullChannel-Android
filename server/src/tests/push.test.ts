import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>{
 Object.assign(process.env,{NODE_ENV:'test',CLIENT_URL:'https://test.invalid',SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',IMAGEKIT_PUBLIC_KEY:'fixture',IMAGEKIT_PRIVATE_KEY:'fixture',IMAGEKIT_URL_ENDPOINT:'https://test.invalid'});
 return {valid:true,member:true,send:vi.fn(async()=> 'fixture-message')};
});
vi.mock('../config/supabase.js',()=>({supabase:{from:vi.fn()}}));
vi.mock('../services/mobile-auth.service.js',()=>({verifyPushSession:async(id:string)=>state.valid?{id,identityId:'fixture-identity',accountId:null}:null,mobileAccountActive:async()=>true}));
vi.mock('../services/membership.service.js',()=>({isActiveMember:async()=>state.member,getParticipantsForRoom:async()=>state.member?[{sender_id:'fixture-identity'}]:[]}));
vi.mock('firebase-admin/app',()=>({getApps:()=>[{}],initializeApp:vi.fn(),applicationDefault:vi.fn()}));
vi.mock('firebase-admin/messaging',()=>({getMessaging:()=>({send:state.send})}));
import {PushDevices,pushDevices,deliverPush,pushRoomEvent} from '../services/push.service.js';
import {env} from '../config/env.js';
const principal={id:'fixture-session',identityId:'fixture-identity',accountId:null};
const secret='a'.repeat(64);
beforeEach(()=>{state.valid=true;state.member=true;state.send.mockReset();state.send.mockResolvedValue('fixture-message');pushDevices.devices.clear();env.PUSH_ENABLED='true';});
describe('session-bound private push delivery',()=>{
 it('rotates tokens without allowing another secret to seize a device',async()=>{const devices=new PushDevices();await devices.register('fixture-device','old-token',secret,principal);await devices.register('fixture-device','new-token',secret,principal);expect((await devices.authenticate('fixture-device',secret))?.token).toBe('new-token');await expect(devices.register('fixture-device','attacker-token','b'.repeat(64),principal)).rejects.toThrow('OWNERSHIP');expect(await devices.authenticate('fixture-device','b'.repeat(64))).toBeNull();});
 it('revokes all subscriptions for a session and rejects expired/revoked sessions',async()=>{const devices=new PushDevices();await devices.register('one','token',secret,principal);await devices.register('two','token2',secret,principal);await devices.revokeSession(principal.id);expect(devices.devices.size).toBe(0);await devices.register('three','token',secret,principal);state.valid=false;expect(await devices.authenticate('three',secret)).toBeNull();expect(devices.devices.size).toBe(0);});
 it('authorizes room membership and excludes the sender before emitting content-free data',async()=>{
  await pushDevices.register('one','fixture-token',secret,principal);
  const event={eventId:'event',kind:'message' as const,roomCode:'TEST1234',expiresAt:Date.now()+60000};
  state.member=false;await pushRoomEvent('room',event);expect(state.send).not.toHaveBeenCalled();
  state.member=true;await pushRoomEvent('room',event,undefined,'fixture-identity');expect(state.send).not.toHaveBeenCalled();
  await pushRoomEvent('room',event);const sent=state.send.mock.calls[0] as unknown as [Record<string,unknown>];expect(sent[0]).toMatchObject({data:{kind:'message',roomCode:'TEST1234'}});expect(JSON.stringify(sent[0])).not.toMatch(/content|password|secretHash|accessToken/);
 });
 it('suppresses expired delivery and duplicate devices sharing one FCM token',async()=>{const devices=new PushDevices();const one=await devices.register('one','same-token',secret,principal),two=await devices.register('two','same-token',secret,principal);const event={eventId:'call',kind:'incoming-call' as const,roomCode:'TEST1234',callId:'call-id',expiresAt:Date.now()-1};await deliverPush([one,two],event);expect(state.send).not.toHaveBeenCalled();await deliverPush([one,two],{...event,expiresAt:Date.now()+30000});expect(state.send).toHaveBeenCalledTimes(1);expect(state.send.mock.calls[0]).toMatchObject([{android:{priority:'high'}}]);});
 it('removes provider-invalid tokens without logging provider errors',async()=>{const row=await pushDevices.register('one','invalid-token',secret,principal);state.send.mockRejectedValueOnce({code:'messaging/registration-token-not-registered',message:'sensitive provider payload'});await deliverPush([row],{eventId:'id',kind:'message',roomCode:'TEST1234',expiresAt:Date.now()+60000});expect(pushDevices.devices.size).toBe(0);});
});
