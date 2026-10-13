import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const dsn = process.env.MOBILE_AUTH_TEST_DATABASE_URL;

describe.skipIf(!dsn)('mobile auth and guest room authorization on isolated local PostgreSQL', () => {
  it('creates sessions, rotates refresh tokens, detects replay, and revokes sessions', async () => {
    const url = new URL(dsn!);
    if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || !url.pathname.startsWith('/nullchannel_test')) {
      throw new Error('MOBILE_AUTH_TEST_DATABASE_URL must name a dedicated loopback nullchannel_test database');
    }
    const result = await exec('psql', [dsn!, '-X', '-v', 'ON_ERROR_STOP=1', '-f', new URL('./sql/mobile-auth-v24.sql', import.meta.url).pathname]);
    expect(result.stderr).toContain('PASS mobile auth v24');
  }, 15000);

  it('keeps mobile guest identities valid for room creation through refresh, and revokes them on logout/expiry', async () => {
    const url = new URL(dsn!);
    if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || !url.pathname.startsWith('/nullchannel_test')) {
      throw new Error('MOBILE_AUTH_TEST_DATABASE_URL must name a dedicated loopback nullchannel_test database');
    }
    const migrationState = await exec('psql', [dsn!, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='anonymous_sessions' and column_name='mobile_session_id')"]);
    const tests = new URL('./sql/mobile-guest-room-v25.sql', import.meta.url).pathname;
    let backfillFixtureCreated = false;
    if (migrationState.stdout.trim() === 'f') {
      await exec('psql', [dsn!, '-X', '-v', 'ON_ERROR_STOP=1', '-f', new URL('./sql/mobile-guest-v24-unlinked.sql', import.meta.url).pathname]);
      backfillFixtureCreated = true;
      await exec('psql', [dsn!, '-X', '-v', 'ON_ERROR_STOP=1', '-f', new URL('../../../docs/supabase-migration-v25.sql', import.meta.url).pathname]);
    } else if (migrationState.stdout.trim() !== 't') {
      throw new Error('Could not determine the isolated guest-link migration state');
    }
    try {
      const result = await exec('psql', [dsn!, '-X', '-v', 'ON_ERROR_STOP=1', '-f', tests]);
      expect(result.stderr).toContain('PASS mobile guest room v25');
    } finally {
      if (backfillFixtureCreated) {
        await exec('psql', [dsn!, '-X', '-v', 'ON_ERROR_STOP=1', '-c', "delete from public.mobile_auth_sessions where id='20000000-0000-4000-8000-000000000050'"]);
      }
    }
  }, 15000);
});
