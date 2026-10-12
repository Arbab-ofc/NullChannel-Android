import express from 'express';
import request from 'supertest';
import { describe,it,expect,vi } from 'vitest';
vi.mock('../services/account.service.js',()=>({verifyAccountCookie:vi.fn(async()=>null)}));
vi.mock('../config/env.js',()=>({env:{REST_MUTATION_LIMIT:120,REST_MANAGEMENT_LIMIT:20}}));
vi.mock('../config/supabase.js',()=>({supabase:{}}));
vi.mock('../services/cleanup.service.js',()=>({cleanupRoomsByIds:vi.fn()}));
vi.mock('../sockets/emitter.js',()=>({emitTemporaryRoomEvent:vi.fn(),revokeRoomSockets:vi.fn()}));
vi.mock('../services/presence.service.js',()=>({emitAccountEvent:vi.fn()}));
import rooms from '../routes/registered-room.routes.js';
import match from '../routes/match.routes.js';
import groups from '../routes/group-tools.routes.js';
const app=express();app.use(express.json(),rooms,match,groups);app.get('/guest-probe',(_req,res)=>res.status(204).end());
describe('registered API authorization boundaries preserve guest routes',()=>{
 it('passes unrelated guest routes through every registered router',async()=>{expect((await request(app).get('/guest-probe')).status).toBe(204);});
 it.each([['get','/registered/invitations/eligibility/test_friend'],['get','/registered/rooms'],['get','/registered/explore'],['post','/registered/invitations'],['post','/match/start'],['get','/match/status'],['post','/registered/rooms/ABCD1234/polls'],['post','/registered/invite-links/consume']] as const)('rejects unauthenticated %s %s',async(method,path)=>{const response=await request(app)[method](path);expect(response.status).toBe(401);expect(response.body.error.code).toBe('ACCOUNT_REQUIRED');});
});
