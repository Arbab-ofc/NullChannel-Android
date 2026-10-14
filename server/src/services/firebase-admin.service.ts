import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/** Lazy, named app: unrelated Firebase apps cannot select another push project. */
export function firebasePushMessaging() {
  if (env.PUSH_ENABLED !== 'true') return null;
  try {
    if (!env.FIREBASE_PROJECT_ID) throw new Error('Missing push project');
    const existing = getApps().find(app => app.name === 'nullchannel-push');
    if (existing && existing.options.projectId !== env.FIREBASE_PROJECT_ID) throw new Error('Push project mismatch');
    const app = existing ?? initializeApp({
      credential: applicationDefault(), projectId: env.FIREBASE_PROJECT_ID
    }, 'nullchannel-push');
    return getMessaging(app);
  } catch {
    // SDK exceptions may contain credential paths or account/payload details.
    logger.error('push_initialization_failed');
    return null;
  }
}
