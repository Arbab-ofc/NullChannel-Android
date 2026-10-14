import express from 'express';
import request from 'supertest';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({valid:true,member:true,expired:false,principal:{id:'session',identityId:'identity',accountId:null},register:vi.fn(),remove:vi.fn(),end:vi.fn(),ringing:vi.fn()}));
vi.mock('../config/env.js',()=>({env:{MOBILE_APP_ORIGIN:'https://localhost'}}));
vi.mock('../services/mobile-auth.service.js',()=>({verifyMobileAccess:async(value:unknown)=>fixture.valid&&value==='a'.repeat(64)?fixture.principal:null,mobileAccountActive:async()=>true}));
vi.mock('../services/push.service.js',()=>({pushDevices:{register:fixture.register,remove:fixture.remove,authenticate:async(_id:string,secret:string)=>fixture.valid&&secret==='b'.repeat(64)?{principal:fixture.principal,deviceId:'device'}:null,identity:async()=> 'identity'}}));
vi.mock('../services/room.service.js',()=>({getRoomByCode:async()=>fixture.expired?null:{id:'room',code:'TEST1234',expires_at:new Date(Date.now()+60000).toISOString()}}));
vi.mock('../services/membership.service.js',()=>({isActiveMember:async()=>fixture.member}));
vi.mock('../sockets/emitter.js',()=>({currentCallRegistry:()=>({invitation:()=>fixture.expired?null:{callId:'call',roomCode:'TEST1234'},end:fixture.end,ringing:fixture.ringing,canControl:()=>false})}));
import routes from '../routes/push.routes.js';
const app=express();app.use(express.json(),routes);
const path='/mobile/push/devices/device/verify';
beforeEach(()=>{fixture.valid=true;fixture.member=true;fixture.expired=false;vi.clearAllMocks();});
describe('Android push registration and notification-action authorization',()=>{
 it('requires exact Android origin and authenticated bearer registration',async()=>{const data={deviceId:'c89b38b9-27a7-4bcc-a12d-b44fc1d2a5ab',token:'fixture-token-long-enough',secret:'b'.repeat(64)};
  expect((await request(app).put('/mobile/push/devices').send(data)).status).toBe(403);
  expect((await request(app).put('/mobile/push/devices').set('Origin','https://localhost').send(data)).status).toBe(401);
  expect((await request(app).put('/mobile/push/devices').set('Origin','https://localhost').set('Authorization',`Bearer ${'a'.repeat(64)}`).send(data)).status).toBe(200);expect(fixture.register).toHaveBeenCalledOnce();
 });
 it('rejects incorrect device proofs and revoked sessions before actions',async()=>{expect((await request(app).post(path).set('Origin','https://localhost').send({roomCode:'TEST1234',callId:'call',action:'decline'})).status).toBe(401);fixture.valid=false;expect((await request(app).post(path).set('Origin','https://localhost').set('X-NC-Device-Secret','b'.repeat(64)).send({roomCode:'TEST1234',callId:'call',action:'decline'})).status).toBe(401);expect(fixture.end).not.toHaveBeenCalled();});
 it('rejects lost room membership and expired invitations before decline/ringing actions',async()=>{fixture.member=false;expect((await request(app).post(path).set('Origin','https://localhost').set('X-NC-Device-Secret','b'.repeat(64)).send({roomCode:'TEST1234',callId:'call',action:'decline'})).status).toBe(410);fixture.member=true;fixture.expired=true;expect((await request(app).post(path).set('Origin','https://localhost').set('X-NC-Device-Secret','b'.repeat(64)).send({roomCode:'TEST1234',callId:'call',action:'ringing'})).status).toBe(410);expect(fixture.end).not.toHaveBeenCalled();expect(fixture.ringing).not.toHaveBeenCalled();});
 it('declines only an authorized live invitation',async()=>{expect((await request(app).post(path).set('Origin','https://localhost').set('X-NC-Device-Secret','b'.repeat(64)).send({roomCode:'TEST1234',callId:'call',action:'decline'})).status).toBe(200);expect(fixture.end).toHaveBeenCalledWith('call','declined');});
 it('rotates tokens only with the registered device proof',async()=>{
  const token='fixture-rotated-token-long-enough';
  expect((await request(app).post('/mobile/push/devices/device/token').set('Origin','https://localhost').send({token})).status).toBe(401);
  expect((await request(app).post('/mobile/push/devices/device/token').set('Origin','https://localhost').set('X-NC-Device-Secret','b'.repeat(64)).send({token})).status).toBe(200);
  expect(fixture.register).toHaveBeenCalledWith('device',token,'b'.repeat(64),fixture.principal);
 });
 it('revokes a token only with the registered device proof',async()=>{
  expect((await request(app).delete('/mobile/push/devices/device').set('Origin','https://localhost')).status).toBe(401);
  expect((await request(app).delete('/mobile/push/devices/device').set('Origin','https://localhost').set('X-NC-Device-Secret','b'.repeat(64))).status).toBe(200);
  expect(fixture.remove).toHaveBeenCalledWith('device');
 });
});
