import { expect, it } from 'vitest';
import { cleanupLabel, sessionRemaining } from '../pages/AccountPages';
it('reports cleanup pending separately from completed deletion',()=>{
 expect(cleanupLabel('media_cleanup_pending')).toBe('Media Cleanup Pending');expect(cleanupLabel('cleanup_failed')).toBe('Cleanup Failed');expect(cleanupLabel('unexpected')).toBe('Cleanup status unavailable');
});
it('reports remaining lifetime and never renders negative countdowns',()=>{
 expect(sessionRemaining('2026-01-01T01:01:01Z',Date.parse('2026-01-01T00:00:00Z'))).toBe('1h 1m 1s remaining');expect(sessionRemaining('2026-01-01T00:00:00Z',Date.parse('2026-01-01T00:00:01Z'))).toBe('0h 0m 0s remaining');
});
