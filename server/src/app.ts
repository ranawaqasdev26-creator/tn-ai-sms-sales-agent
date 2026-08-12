import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDatabase, setSetting } from './db/index.js';
import { seedDatabase } from './db/seed.js';
import { seedDefaultAgent } from './services/auth.js';
import apiRouter from './routes/api.js';
import { setBroadcast } from './services/conversation.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const app = express();
// Trust exactly one reverse-proxy hop (nginx on AWS, or Vercel's edge) so
// req.protocol/req.ip are correct. `true` would trust every hop, which lets
// clients spoof X-Forwarded-For and defeats express-rate-limit's IP keying.
app.set('trust proxy', 1);

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));

let bootPromise: Promise<void> | null = null;

export function ensureBooted(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      initDatabase();
      seedDatabase();
      if (process.env.DEMO_MODE === 'false') setSetting('demo_mode', 'false');
      await seedDefaultAgent();
    })();
  }
  return bootPromise;
}

app.use(async (_req, _res, next) => {
  try {
    await ensureBooted();
    next();
  } catch (err) {
    next(err);
  }
});

// General rate ceiling on the whole API; tighter per-route limits (login,
// public webhooks) are applied inside routes/api.ts.
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

app.use('/api', apiRouter);

if (!isServerless) {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next();
    });
  });
}

setBroadcast((_event, _data) => {
  /* overridden by local index.ts WebSocket broadcaster */
});

export default app;
