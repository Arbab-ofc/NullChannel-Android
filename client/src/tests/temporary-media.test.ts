import {expect,it} from 'vitest';
import {messageDeadline,resolveMediaUrl,viewOnceUrl} from '../lib/temporary-media';
it('resolves protected paths against API origin and keeps existing HTTPS provider paths',()=>{
 expect(resolveMediaUrl('/api/media/files/test','https://api.example.test')).toBe('https://api.example.test/api/media/files/test');expect(resolveMediaUrl('https://images.example.test/file')).toBe('https://images.example.test/file');expect(resolveMediaUrl('javascript:alert(1)')).toBe('');
});
it('requires an explicit opening query for view-once media',()=>{expect(viewOnceUrl('/api/media/files/test','')).toBe('/api/media/files/test?open=1');});
it('respects the earlier burn deadline without extending it with a timed policy',()=>{const early='2026-01-01T00:01:00Z';expect(messageDeadline({burn_expires_at:early,message_expires_at:'2026-01-01T01:00:00Z'})).toBe(Date.parse(early));expect(messageDeadline({message_expires_at:'invalid'})).toBeNull();});
