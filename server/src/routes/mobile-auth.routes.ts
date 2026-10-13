import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { accountAuthClient, profileFor, validPassword, validUsername } from '../services/account.service.js';
import { createMobileSession, revokeMobileSession, rotateMobileSession } from '../services/mobile-auth.service.js';
import { rateLimitHandler } from '../middlewares/rateLimit.middleware.js';
import { errorResponse, successResponse } from '../utils/apiResponse.js';
import { respondToAuthEmailFailure } from '../services/auth-email.service.js';

const router = Router();
const limiter = (limit: number) => rateLimit({ windowMs: 60000, limit, handler: rateLimitHandler, standardHeaders: true, legacyHeaders: false });
const guestLimit = limiter(30);
const loginLimit = limiter(10);
const signupLimit = limiter(6);
const refreshLimit = limiter(30);
const logoutLimit = limiter(30);
const username = z.string().refine(validUsername, 'Use 3–24 letters, digits or underscores; reserved names are unavailable.');
const password = z.string().refine(validPassword, 'Use 12–128 characters.');
const bearer = (value: string | undefined) => {
  const match = value?.match(/^Bearer ([a-f0-9]{64})$/);
  return match?.[1];
};

const responseFor = (credentials: Awaited<ReturnType<typeof createMobileSession>>) => ({
  accessToken: credentials.accessToken,
  refreshToken: credentials.refreshToken,
  accessExpiresAt: credentials.accessExpiresAt,
  refreshExpiresAt: credentials.refreshExpiresAt,
  identityId: credentials.identityId
});

router.post('/mobile/session', guestLimit, async (_req, res, next) => {
  try { res.status(201).json(successResponse(responseFor(await createMobileSession()))); }
  catch (error) { next(error); }
});

router.post('/mobile/auth/signup', signupLimit, async (req, res, next) => {
  try {
    const parsed = z.object({ username, email: z.email(), password }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json(errorResponse('VALIDATION_ERROR', parsed.error.issues[0].message)); return; }
    const schema = await supabase.from('profiles').select('id').limit(0);
    if (schema.error) { res.status(503).json(errorResponse('ACCOUNT_SETUP_PENDING', 'Account registration is unavailable until the database upgrade is applied.')); return; }
    const auth = accountAuthClient();
    const { data, error } = await auth.auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: { data: { username: parsed.data.username } } });
    if (error) {
      if (respondToAuthEmailFailure(error, res)) return;
      res.status(400).json(errorResponse('REGISTRATION_FAILED', 'Registration could not be completed. Check your details or try another username.')); return;
    }
    if (!data.session || !data.user) {
      res.status(201).json(successResponse({ profile: null, verification_required: true })); return;
    }
    const signedOut=await auth.auth.admin.signOut(data.session.access_token,'local');
    if(signedOut.error)throw new Error('AUTH_UNAVAILABLE');
    const credentials = await createMobileSession(data.user.id);
    res.status(201).json(successResponse({ ...responseFor(credentials), profile: await profileFor(data.user.id), verification_required: false }));
  } catch (error) { next(error); }
});

router.post('/mobile/auth/login', loginLimit, async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.email(), password: z.string().min(1).max(128) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json(errorResponse('VALIDATION_ERROR', 'Enter a valid email and password.')); return; }
    const auth=accountAuthClient();
    const { data, error } = await auth.auth.signInWithPassword(parsed.data);
    if (error || !data.user || !data.session) { res.status(401).json(errorResponse('INVALID_CREDENTIALS', 'Unable to sign in with those credentials.')); return; }
    const signedOut=await auth.auth.admin.signOut(data.session.access_token,'local');
    if(signedOut.error)throw new Error('AUTH_UNAVAILABLE');
    const credentials = await createMobileSession(data.user.id);
    res.json(successResponse({ ...responseFor(credentials), profile: await profileFor(data.user.id) }));
  } catch (error) { next(error); }
});

router.post('/mobile/auth/refresh', refreshLimit, async (req, res, next) => {
  try {
    const credentials = await rotateMobileSession(bearer(req.headers.authorization));
    if (!credentials) { res.status(401).json(errorResponse('MOBILE_SESSION_EXPIRED', 'Sign in again.')); return; }
    res.json(successResponse(responseFor(credentials)));
  } catch (error) { next(error); }
});

router.post('/mobile/auth/logout', logoutLimit, async (req, res, next) => {
  try {
    const revoked = await revokeMobileSession(bearer(req.headers.authorization));
    if (!revoked) { res.status(401).json(errorResponse('MOBILE_SESSION_EXPIRED', 'The mobile session has expired.')); return; }
    res.json(successResponse({ logged_out: true }));
  } catch (error) { next(error); }
});

export default router;
