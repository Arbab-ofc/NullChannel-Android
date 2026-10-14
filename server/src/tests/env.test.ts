import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    CLIENT_URL: 'https://nullchannel.example',
    SUPABASE_URL: 'https://database.example',
    SUPABASE_SERVICE_ROLE_KEY: 'test-only',
    IMAGEKIT_PUBLIC_KEY: 'test-public',
    IMAGEKIT_PRIVATE_KEY: 'test-private',
    IMAGEKIT_URL_ENDPOINT: 'https://media.example'
  });
});
import { createHmac } from 'node:crypto';
import { createTurnCredential, env, parseEnvironment } from '../config/env.js';

const base = {
  CLIENT_URL: 'https://nullchannel.example',
  SUPABASE_URL: 'https://database.example',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only',
  IMAGEKIT_PUBLIC_KEY: 'test-public',
  IMAGEKIT_PRIVATE_KEY: 'test-private',
  IMAGEKIT_URL_ENDPOINT: 'https://media.example'
};

describe('environment origin configuration', () => {
  it('requires an explicit exact mobile origin in production', () => {
    const result = parseEnvironment({ ...base, NODE_ENV: 'production' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(issue => issue.path.join('.'))).toContain('MOBILE_APP_ORIGIN');
  });

  it('keeps the local Capacitor origin as a development and test default', () => {
    for (const NODE_ENV of ['development', 'test']) {
      const result = parseEnvironment({ ...base, NODE_ENV });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.MOBILE_APP_ORIGIN).toBe('https://localhost');
    }
  });

  it('accepts only explicitly configured exact origins in production', () => {
    const configured = parseEnvironment({ ...base, NODE_ENV: 'production', MOBILE_APP_ORIGIN: 'https://localhost' });
    expect(configured.success).toBe(true);
    const path = parseEnvironment({ ...base, NODE_ENV: 'production', MOBILE_APP_ORIGIN: 'https://localhost/app' });
    expect(path.success).toBe(false);
  });

  it('requires TURN URLs and the server-only shared secret as a pair', () => {
    expect(parseEnvironment({ ...base, TURN_URLS: 'turn:relay.example:3478' }).success).toBe(false);
    expect(parseEnvironment({ ...base, TURN_SHARED_SECRET: 'a'.repeat(32) }).success).toBe(false);
    expect(parseEnvironment({ ...base, TURN_URLS: 'turn:relay.example:3478?transport=udp,turns:relay.example:5349?transport=tcp', TURN_SHARED_SECRET: 'a'.repeat(32) }).success).toBe(true);
    expect(parseEnvironment({ ...base, TURN_URLS: 'turn:user:password@relay.example', TURN_SHARED_SECRET: 'a'.repeat(32) }).success).toBe(false);
  });

  it('creates timestamped TURN REST credentials and never returns the shared secret', () => {
    const oldUrls = env.TURN_URLS, oldSecret = env.TURN_SHARED_SECRET;
    env.TURN_URLS = 'turn:relay.example:3478?transport=udp'; env.TURN_SHARED_SECRET = 's'.repeat(40);
    try {
      const now = 1_800_000_000_000;
      const [server] = createTurnCredential(now);
      expect(server.urls).toEqual(['turn:relay.example:3478?transport=udp']);
      expect(server.username).toMatch(/^1800003600:/);
      expect(server.credential).toBe(createHmac('sha1', 's'.repeat(40)).update(server.username).digest('base64'));
      expect(JSON.stringify(server)).not.toContain('s'.repeat(40));
    } finally { env.TURN_URLS = oldUrls; env.TURN_SHARED_SECRET = oldSecret; }
  });
});
