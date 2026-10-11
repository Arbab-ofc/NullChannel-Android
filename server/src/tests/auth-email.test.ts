import { expect, it, vi } from 'vitest';
import type { Response } from 'express';
vi.mock('../utils/logger.js', () => ({logger:{error:vi.fn()}}));
import { respondToAuthEmailFailure } from '../services/auth-email.service.js';
const response=()=>{const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res;};
it('reports SMTP service failures without claiming an email was accepted or leaking provider details',()=>{
 const res=response();expect(respondToAuthEmailFailure({status:500},res as unknown as Response)).toBe(true);
 expect(res.status).toHaveBeenCalledWith(503);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({error:expect.objectContaining({code:'AUTH_EMAIL_UNAVAILABLE'})}));
});
it('preserves rate-limit feedback for Auth mail delivery',()=>{
 const res=response();expect(respondToAuthEmailFailure({status:429,code:'over_email_send_rate_limit'},res as unknown as Response)).toBe(true);expect(res.status).toHaveBeenCalledWith(429);
});
it('leaves ordinary registration validation and neutral unknown-email handling to the caller',()=>{
 const res=response();expect(respondToAuthEmailFailure({status:400,code:'email_address_invalid'},res as unknown as Response)).toBe(false);expect(res.json).not.toHaveBeenCalled();
});
