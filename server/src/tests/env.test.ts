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
import { parseEnvironment } from '../config/env.js';

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
});
