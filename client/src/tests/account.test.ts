import { describe, expect, it } from 'vitest';
import { safeNext } from '../pages/AuthPage';
import { accountError } from '../lib/account';
describe('registered frontend safety', () => {
  it('keeps post-login navigation on the current origin', () => {
    for (const next of ['https://attacker.test','//attacker.test','/\\attacker.test',null]) expect(safeNext(next)).toBe('/dashboard');
    expect(safeNext('/friends/requests')).toBe('/friends/requests');
  });
  it('does not expose arbitrary database failures', () => {
    expect(accountError(new Error('postgres secret query'))).toBe('This action could not be completed. Please try again.');
  });
});
