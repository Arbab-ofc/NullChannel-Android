import dotenv from 'dotenv';
import { z } from 'zod';
import { createHmac, randomUUID } from 'node:crypto';

if (process.env.NODE_ENV !== 'test') dotenv.config({ quiet: true });

const exactOrigin = z.string().url().refine(value => new URL(value).origin === value, 'Use an exact mobile app origin without a trailing slash.');
const envSchema = z.object({
  BACKGROUND_CLEANUP_ENABLED: z.enum(['true','false']).default('true'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5050),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CLIENT_URL: z.string().url().refine(value => new URL(value).origin === value, 'Use an exact origin without a trailing slash.'),
  MOBILE_APP_ORIGIN: exactOrigin.optional(),
  DATABASE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  IMAGEKIT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
  IMAGEKIT_PUBLIC_KEY: z.string().min(1),
  IMAGEKIT_PRIVATE_KEY: z.string().min(1),
  IMAGEKIT_URL_ENDPOINT: z.string().url(),
  SOCKET_CONNECTION_LIMIT: z.coerce.number().int().positive().default(60),
  SOCKET_JOIN_LIMIT: z.coerce.number().int().positive().default(30),
  SOCKET_MESSAGE_LIMIT: z.coerce.number().int().positive().default(120),
  SOCKET_TYPING_LIMIT: z.coerce.number().int().positive().default(180),
  REST_MUTATION_LIMIT: z.coerce.number().int().positive().default(120),
  REST_MANAGEMENT_LIMIT: z.coerce.number().int().positive().default(20),
  UPLOAD_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  CALL_RING_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(30000),
  CALL_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(20000),
  CALL_DISCONNECT_GRACE_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  CALL_INVITE_LIMIT: z.coerce.number().int().min(1).max(30).default(6),
  CALL_SIGNAL_LIMIT: z.coerce.number().int().min(1).max(1000).default(300),
  CALL_MAX_CANDIDATES: z.coerce.number().int().min(16).max(512).default(256),
  CALL_MAX_ACTIVE: z.coerce.number().int().min(1).max(10000).default(1000),
  TURN_URLS: z.string().optional(),
  TURN_SHARED_SECRET: z.string().min(32).optional(),
  TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  PUSH_ENABLED: z.enum(['true','false']).default('false'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  PUSH_DEVICE_STORE_PATH: z.string().optional(),
  PUSH_DEVICE_STORE_KEY: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  HOST: z.string().default('127.0.0.1'),
  FRIEND_REQUEST_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  CLEANUP_SECRET: z.string().optional()
}).superRefine((value, context) => {
  if (Boolean(value.PUSH_DEVICE_STORE_PATH) !== Boolean(value.PUSH_DEVICE_STORE_KEY)) context.addIssue({code:'custom',path:['PUSH_DEVICE_STORE_PATH'],message:'Encrypted push store path and key must be configured together.'});
  if (value.NODE_ENV === 'production' && !value.MOBILE_APP_ORIGIN) {
    context.addIssue({ code: 'custom', path: ['MOBILE_APP_ORIGIN'], message: 'MOBILE_APP_ORIGIN must be explicitly configured in production.' });
  }
  if (Boolean(value.TURN_URLS) !== Boolean(value.TURN_SHARED_SECRET)) {
    context.addIssue({ code: 'custom', path: ['TURN_SHARED_SECRET'], message: 'TURN_URLS and TURN_SHARED_SECRET must be configured together.' });
  }
  if (value.TURN_URLS && value.TURN_URLS.split(',').some(url => !/^turns?:[a-z0-9.-]+(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/i.test(url.trim()))) {
    context.addIssue({ code: 'custom', path: ['TURN_URLS'], message: 'Use comma-separated turn: or turns: relay URLs without embedded credentials.' });
  }
}).transform(value => ({ ...value, MOBILE_APP_ORIGIN: value.MOBILE_APP_ORIGIN ?? 'https://localhost' }));

export const parseEnvironment = (source: Record<string, string | undefined>) => envSchema.safeParse(source);
const parsed = parseEnvironment(process.env);
if (!parsed.success) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), severity: 'error', operation: 'invalid_environment', fields: [...new Set(parsed.error.issues.map(issue => issue.path.join('.')))] }));
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

export const createTurnCredential = (now = Date.now()) => {
  if (!env.TURN_URLS || !env.TURN_SHARED_SECRET) return [];
  const expires = Math.floor(now / 1000) + env.TURN_CREDENTIAL_TTL_SECONDS;
  const username = `${expires}:${randomUUID()}`;
  const credential = createHmac('sha1', env.TURN_SHARED_SECRET).update(username).digest('base64');
  return [{ urls: env.TURN_URLS.split(',').map(url => url.trim()), username, credential }];
};
