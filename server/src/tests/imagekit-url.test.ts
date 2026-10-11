import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/env.js', () => ({ env: {
  IMAGEKIT_PUBLIC_KEY: 'test-public-key', IMAGEKIT_PRIVATE_KEY: 'test-private-key',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/test-account/nullchannel', IMAGEKIT_TIMEOUT_MS: 1000
} }));
import { imagekit } from '../config/imagekit.js';

describe('ImageKit endpoint and Media Library folder routing', () => {
  it('keeps the full folder path when its name matches the custom endpoint slug', () => {
    const url = new URL(imagekit.url({ path: '/nullchannel/room/file.png', signed: true, expireSeconds: 60 }));
    // First nullchannel selects the endpoint; second nullchannel is the stored folder.
    expect(url.pathname).toBe('/test-account/nullchannel/nullchannel/room/file.png');
    expect(url.searchParams.get('ik-s')).toBe(createHmac('sha1', 'test-private-key')
      .update(`nullchannel/room/file.png${url.searchParams.get('ik-t')}`).digest('hex'));
  });
});
