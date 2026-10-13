import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const dsn = process.env.MOBILE_AUTH_TEST_DATABASE_URL;

describe.skipIf(!dsn)('mobile auth v24 against isolated local PostgreSQL', () => {
  it('creates sessions, rotates refresh tokens, detects replay, and revokes sessions', async () => {
    const url = new URL(dsn!);
    if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || !url.pathname.startsWith('/nullchannel_test')) {
      throw new Error('MOBILE_AUTH_TEST_DATABASE_URL must name a dedicated loopback nullchannel_test database');
    }
    const result = await exec('psql', [dsn!, '-X', '-v', 'ON_ERROR_STOP=1', '-f', new URL('./sql/mobile-auth-v24.sql', import.meta.url).pathname]);
    expect(result.stderr).toContain('PASS mobile auth v24');
  }, 15000);
});
