import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyAccountCookie, verifyMobileAccess, mobileAccountActive } = vi.hoisted(() => ({
  verifyAccountCookie: vi.fn(),
  verifyMobileAccess: vi.fn(),
  mobileAccountActive: vi.fn()
}));

vi.mock('../services/account.service.js', () => ({
  accountAuthClient: vi.fn(),
  verifyAccountCookie
}));
vi.mock('../services/mobile-auth.service.js', () => ({ verifyMobileAccess, mobileAccountActive }));
vi.mock('../config/env.js', () => ({ env: { MOBILE_APP_ORIGIN: 'https://localhost' } }));

import { requireAccount } from '../middlewares/account.middleware.js';

const app = express();
app.get('/account/probe', requireAccount, (_req, res) => res.json({ accountId: res.locals.accountId }));

beforeEach(() => {
  verifyAccountCookie.mockReset().mockResolvedValue({ id: 'website-account', email: 'web@example.test' });
  verifyMobileAccess.mockReset().mockResolvedValue(null);
  mobileAccountActive.mockReset().mockResolvedValue(true);
});

describe('account middleware preserves website cookie and Android bearer auth', () => {
  it('continues authenticating website requests from the verified account cookie', async () => {
    const response = await request(app).get('/account/probe')
      .set('Origin', 'https://nullchannel.example')
      .set('Cookie', 'nc_account_access=verified-cookie');
    expect(response.status).toBe(200);
    expect(response.body.accountId).toBe('website-account');
    expect(verifyAccountCookie).toHaveBeenCalledWith('nc_account_access=verified-cookie', false);
    expect(verifyMobileAccess).not.toHaveBeenCalled();
  });

  it('authenticates Android account requests from a validated bearer session', async () => {
    verifyMobileAccess.mockResolvedValue({ id: 'mobile-session', accountId: 'android-account', identityId: null });
    const response = await request(app).get('/account/probe')
      .set('Origin', 'https://localhost')
      .set('Authorization', `Bearer ${'a'.repeat(64)}`);
    expect(response.status).toBe(200);
    expect(response.body.accountId).toBe('android-account');
    expect(verifyMobileAccess).toHaveBeenCalledWith('a'.repeat(64));
    expect(verifyAccountCookie).not.toHaveBeenCalled();
    expect(mobileAccountActive).toHaveBeenCalledWith('android-account');
  });
});
