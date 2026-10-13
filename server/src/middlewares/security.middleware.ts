import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import type { Express } from 'express';
import { env } from '../config/env.js';

export const applySecurity = (app: Express) => {
  app.use(helmet());
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || origin === env.CLIENT_URL || origin === env.MOBILE_APP_ORIGIN), credentials: true }));
  if (env.NODE_ENV === 'development') app.use(morgan('dev'));
};
