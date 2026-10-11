import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../config/supabase.js',()=>({supabase:{from:vi.fn()}}));
vi.mock('../services/media.service.js',()=>({queueUnusedUpload:vi.fn()}));
import {messageAvailable} from '../services/message.service.js';
import {socketMessageSchema} from '../schemas/message.schema.js';
const payload={roomCode:'ABCDEFGH',senderId:'550e8400-e29b-41d4-a716-446655440000',type:'text',content:'temporary'};
beforeEach(()=>vi.useRealTimers());
describe('timed message contracts',()=>{
 it('expiry boundaries are exclusive and Burn Mode can expire first',()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));expect(messageAvailable({message_expires_at:'2026-10-11T00:00:00Z'})).toBe(false);expect(messageAvailable({message_expires_at:'2026-10-11T00:00:01Z'})).toBe(true);expect(messageAvailable({message_expires_at:'2026-10-11T00:00:30Z',burn_expires_at:'2026-10-11T00:00:00Z'})).toBe(false);expect(messageAvailable({})).toBe(true);});
 it.each([59,86401,60.5,-1])('rejects invalid TTL %s',ttlSeconds=>expect(socketMessageSchema.safeParse({...payload,ttlSeconds}).success).toBe(false));
 it.each([60,300,86400])('accepts bounded TTL %s',ttlSeconds=>expect(socketMessageSchema.safeParse({...payload,ttlSeconds}).success).toBe(true));
 it('rejects client deadline fields and text view-once',()=>{expect(socketMessageSchema.safeParse({...payload,messageExpiresAt:'2027-01-01'}).success).toBe(false);expect(socketMessageSchema.safeParse({...payload,viewOnce:true}).success).toBe(false);expect(socketMessageSchema.safeParse({...payload,type:'image',fileUrl:'/api/media/files/valid-file',viewOnce:true}).success).toBe(true);});
});
