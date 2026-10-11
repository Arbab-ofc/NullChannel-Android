import type { Response } from 'express';
import { errorResponse } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

/** Report provider outages without disclosing recipient existence or SMTP internals. */
export function respondToAuthEmailFailure(error: { status?: number; code?: string }, res: Response): boolean {
  const limited = error.status === 429 || error.code === 'over_email_send_rate_limit';
  if (!limited && (error.status ?? 0) < 500) return false;
  logger.error('auth_email_provider_failed', {
    provider_status: error.status,
    provider_code: error.code && /^[a-z_]{1,64}$/.test(error.code) ? error.code : undefined
  });
  res.status(limited ? 429 : 503).json(errorResponse(
    limited ? 'AUTH_RATE_LIMITED' : 'AUTH_EMAIL_UNAVAILABLE',
    limited ? 'Too many attempts. Please wait and try again.' : 'Account email is temporarily unavailable. Please try again later.'
  ));
  return true;
}
