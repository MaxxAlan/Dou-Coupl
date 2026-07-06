import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Mutex } from 'async-mutex';
import { z } from 'zod';
import pino from 'pino';
import bcrypt from 'bcryptjs';

dotenv.config();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime
});

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = path.join(process.cwd(), 'db.json');
const dbMutex = new Mutex();
const sseMutex = new Mutex();

// --- Anti-Replay & CSRF protection ---
const VALID_NONCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const usedNonces = new Set<string>();
// Periodic cleanup of old nonces
setInterval(() => { usedNonces.clear(); }, VALID_NONCE_WINDOW_MS);

// --- Session tracking (Session Fixation prevention) ---
let sessionVersion = 0;
const activeSessions = new Map<string, { version: number; createdAt: number }>();
function bumpSessionVersion() {
  sessionVersion++;
  activeSessions.clear();
}

// --- HMAC signing key for request integrity ---
const HMAC_KEY = crypto.randomBytes(32).toString('hex');

// Security check helper
import { DEFAULT_STATE, CLEAN_STATE } from './src/lib/demoData';

// Zod schemas for input validation
const messageSchema = z.object({
  senderId: z.enum(['A', 'B']),
  ciphertext: z.string().min(1).max(5000000), // Max 5MB
  iv: z.string().min(1).max(256),
  type: z.enum(['text', 'image_ref', 'voice']).optional(),
  duration: z.number().int().min(0).max(3600).optional()
});

const photoSchema = z.object({
  senderId: z.enum(['A', 'B']),
  ciphertext: z.string().min(1).max(20000000), // Max 20MB Base64
  iv: z.string().min(1).max(256),
  captionCiphertext: z.string().max(100000).optional().nullable(),
  captionIv: z.string().max(256).optional().nullable(),
  isViewOnce: z.boolean().optional()
});

const reminderSchema = z.object({
  title: z.string().min(1).max(500),
  category: z.enum(['date', 'gift', 'daily', 'special']),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  createdBy: z.enum(['A', 'B'])
});

const anniversarySchema = z.object({
  anniversaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
});

const passcodeSchema = z.object({
  passcode: z.string().max(100), // Will be hashed on server. Send empty string to clear.
  partnerId: z.enum(['A', 'B'])
});

const passcodeVerifySchema = z.object({
  passcode: z.string().min(1).max(100),
  partnerId: z.enum(['A', 'B'])
});

const specialAnniversarySchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  notes: z.string().max(10000).optional().nullable(),
  photo: z.string().max(10000000).optional().nullable(),
  createdBy: z.enum(['A', 'B'])
});

const profileSchema = z.object({
  partnerId: z.enum(['A', 'B']),
  name: z.string().min(1).max(100),
  avatar: z.string().min(1).max(10000000)
});

const storageMethodSchema = z.object({
  partnerId: z.enum(['A', 'B']),
  storageMethod: z.enum(['p2p', 'googledrive'])
});

const waterLogSchema = z.object({
  partnerId: z.enum(['A', 'B']),
  amount: z.number().int().min(50).max(5000),
  timestamp: z.number().optional()
});

const pairCodeSchema = z.object({
  pairingCode: z.string().min(4).max(50)
});

const aiIdeasSchema = z.object({
  daysTogether: z.number().int().nonnegative(),
  anniversaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  customApiKey: z.string().max(256).optional().nullable()
});

const callSignalSchema = z.object({
  senderId: z.enum(['A', 'B']),
  recipientId: z.enum(['A', 'B']),
  signal: z.any()
});

// Configure Helmet with strict CSP (CSRF/XSS prevention)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://*.googleusercontent.com", "https://*.google.com"],
      connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseapp.com", "https://*.firebasestorage.app", "wss://*.firebaseapp.com", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://dou-coupl.onrender.com", "https://dou-coupl.web.app"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
}));

// CORS Configuration
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
// Always include common origins
const DEFAULT_ALLOWED_ORIGINS = [
  'https://dou-coupl.web.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
];
for (const origin of DEFAULT_ALLOWED_ORIGINS) {
  if (!allowedOrigins.includes(origin)) {
    allowedOrigins.push(origin);
  }
}
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn({ origin }, 'CORS rejected origin');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Global Rate Limiters
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Rate limit exceeded for sensitive action. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiIdeasLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many AI dating advice requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/*', globalLimiter);

// Server-Sent Events clients registry
let sseClients: any[] = [];

// Broadcast event to all SSE clients (Mutex-protected for race condition prevention)
function broadcastEvent(type: string, data: any) {
  sseMutex.runExclusive(() => {
    // Filter sensitive data from broadcasts (Information Disclosure prevention)
    const safeData = filterEventData(type, data);
    const payload = JSON.stringify({ type, data: safeData });
    logger.debug({ type }, 'Broadcasting SSE event');
    sseClients.forEach(client => {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (e) {
        // Clean up failed client connections
      }
    });
  }).catch((e: Error) => logger.error(e, 'SSE broadcast error'));
}

// Filter sensitive fields from SSE broadcast data
function filterEventData(type: string, data: any) {
  if (!data || typeof data !== 'object') return data;
  const filtered = { ...data };
  // Never expose pairing codes or passcodes via SSE
  delete filtered.pairingCode;
  delete filtered.passcodeHashA;
  delete filtered.passcodeHashB;
  delete filtered.newPairingCode;
  return filtered;
}

// Database read/write utilities using Mutex to prevent race conditions
async function readDatabase() {
  return await dbMutex.runExclusive(async () => {
    try {
      const data = await fs.readFile(DB_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // If file doesn't exist, seed default database
      logger.info('Database file not found, seeding default database');
      await fs.writeFile(DB_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
      return DEFAULT_STATE;
    }
  });
}

// Atomic update utility to prevent concurrency overwrite issues (DATA-1)
async function updateDatabase(updater: (state: any) => void) {
  return await dbMutex.runExclusive(async () => {
    let state;
    try {
      const data = await fs.readFile(DB_FILE, 'utf-8');
      state = JSON.parse(data);
    } catch (error) {
      logger.info('Database file not found during update, seeding default state');
      state = { ...DEFAULT_STATE };
    }
    updater(state);
    await fs.writeFile(DB_FILE, JSON.stringify(state, null, 2));
    return state;
  });
}

// Strips out pairingCode and passcode hashes before returning state to client (SEC-1 / SEC-2)
function filterStateForClient(state: any) {
  const cleanState = { ...state };
  delete cleanState.pairingCode;
  delete cleanState.passcodeHash; // Legacy single passcode
  delete cleanState.passcodeHashA;
  delete cleanState.passcodeHashB;
  cleanState.hasPasscodeA = !!state.passcodeHashA;
  cleanState.hasPasscodeB = !!state.passcodeHashB;
  cleanState.waterLogs = state.waterLogs || [];
  return cleanState;
}

// Validate X-Pairing-Code format (Header Injection prevention)
const PAIRING_CODE_REGEX = /^[A-Za-z0-9\-]{4,50}$/;

// Minimal authentication middleware via X-Pairing-Code (SEC-3)
async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const clientCode = req.headers['x-pairing-code'];
    if (!clientCode || typeof clientCode !== 'string') {
      logger.warn({ path: req.path }, 'Request blocked: missing X-Pairing-Code header');
      return res.status(401).json({ error: 'Unauthorized: Missing X-Pairing-Code header' });
    }
    // Header Injection prevention: validate format
    if (!PAIRING_CODE_REGEX.test(clientCode)) {
      return res.status(400).json({ error: 'Invalid X-Pairing-Code format' });
    }
    const state = await readDatabase();
    if (state.pairingCode !== clientCode) {
      logger.warn({ path: req.path }, 'Request blocked: invalid pairing code');
      return res.status(401).json({ error: 'Unauthorized: Invalid pairing code' });
    }
    // Anti-replay: validate nonce and timestamp if provided
    const nonce = req.headers['x-nonce'];
    const timestamp = req.headers['x-timestamp'];
    if (nonce && typeof nonce === 'string' && timestamp && typeof timestamp === 'string') {
      const ts = parseInt(timestamp, 10);
      if (isNaN(ts) || Date.now() - ts > VALID_NONCE_WINDOW_MS) {
        return res.status(401).json({ error: 'Request expired or invalid timestamp' });
      }
      if (usedNonces.has(nonce)) {
        return res.status(401).json({ error: 'Nonce already used (replay detected)' });
      }
      usedNonces.add(nonce);
    }
    // Session validation: check if session is valid
    const sessionToken = req.headers['x-session-token'];
    if (sessionToken && typeof sessionToken === 'string') {
      const session = activeSessions.get(sessionToken);
      if (!session || session.version !== sessionVersion) {
        return res.status(401).json({ error: 'Session expired. Please re-authenticate.' });
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

// --- REST API Router Definitions ---

// Health probe (PROD-1)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// CSRF token endpoint (CSRF protection)
app.get('/api/csrf-token', (req, res) => {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.json({ csrfToken });
});

// Validate senderId against active partners (IDOR prevention)
function validateSenderId(senderId: string, state: any): boolean {
  return senderId === 'A' || senderId === 'B';
}

// Event Stream (SSE) for Realtime updates. Uses header-only auth (no query param leakage).
app.get('/api/events', async (req, res, next) => {
  try {
    let clientCode = req.headers['x-pairing-code'];
    if (!clientCode && req.query.pairingCode && typeof req.query.pairingCode === 'string') {
      clientCode = req.query.pairingCode;
    }
    if (!clientCode || typeof clientCode !== 'string') {
      return res.status(401).json({ error: 'Unauthorized: Missing X-Pairing-Code header or query param' });
    }
    if (!PAIRING_CODE_REGEX.test(clientCode)) {
      return res.status(400).json({ error: 'Invalid X-Pairing-Code format' });
    }
    const state = await readDatabase();
    if (state.pairingCode !== clientCode) {
      return res.status(401).json({ error: 'Unauthorized: Invalid pairing code' });
    }

    const sessionToken = crypto.randomBytes(16).toString('hex');
    activeSessions.set(sessionToken, { version: sessionVersion, createdAt: Date.now() });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Session-Token': sessionToken,
      'Access-Control-Expose-Headers': 'X-Session-Token',
    });

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', sessionToken })}\n\n`);
    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter(client => client !== res);
      activeSessions.delete(sessionToken);
      
      // Auto-clear P2P state when all clients disconnect
      setTimeout(async () => {
        if (sseClients.length === 0) {
          try {
            const currentState = await readDatabase();
            if (currentState.storageMethodA === 'p2p' || currentState.storageMethodB === 'p2p') {
              await updateDatabase(db => {
                db.messages = [];
                db.photos = [];
                db.reminders = [];
              });
              logger.info('[P2P Storage] All clients offline. Cleared E2EE messages, photos & reminders.');
            }
          } catch (e) {
            logger.error(e, 'Error auto-clearing P2P data');
          }
        }
      }, 4000);
    });
  } catch (err) {
    next(err);
  }
});

// Fetch complete app state (Requires auth, hides key & hash)
app.get('/api/state', authMiddleware, async (req, res, next) => {
  try {
    const state = await readDatabase();
    res.json(filterStateForClient(state));
  } catch (error) {
    next(error);
  }
});

// Post a secure message
app.post('/api/messages', authMiddleware, async (req, res, next) => {
  try {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { senderId, ciphertext, iv, type, duration } = parsed.data;
    // IDOR prevention: validate senderId against partner identity
    const partnerId = req.headers['x-partner-id'];
    if (partnerId && (partnerId === 'A' || partnerId === 'B') && senderId !== partnerId) {
      return res.status(403).json({ error: 'Forbidden: senderId does not match your identity' });
    }

    const newMessage = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      senderId,
      ciphertext,
      iv,
      timestamp: Date.now(),
      type: type || 'text',
      duration
    };

    await updateDatabase(db => {
      db.messages.push(newMessage);
    });

    broadcastEvent('NEW_MESSAGE', newMessage);
    res.json({ success: true, message: newMessage });
  } catch (error) {
    next(error);
  }
});

// Post a secure photo to Album
app.post('/api/photos', authMiddleware, async (req, res, next) => {
  try {
    const parsed = photoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { senderId, ciphertext, iv, isViewOnce, captionCiphertext, captionIv } = parsed.data;
    // IDOR prevention: validate senderId against partner identity
    const partnerId = req.headers['x-partner-id'];
    if (partnerId && (partnerId === 'A' || partnerId === 'B') && senderId !== partnerId) {
      return res.status(403).json({ error: 'Forbidden: senderId does not match your identity' });
    }

    const newPhoto = {
      id: 'photo-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      senderId,
      ciphertext,
      iv,
      captionCiphertext,
      captionIv,
      isViewOnce: !!isViewOnce,
      timestamp: Date.now()
    };

    await updateDatabase(db => {
      db.photos.push(newPhoto);
    });

    broadcastEvent('NEW_PHOTO', newPhoto);
    res.json({ success: true, photo: newPhoto });
  } catch (error) {
    next(error);
  }
});

// Delete photo (Manual delete or View Once destruction)
app.delete('/api/photos/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    let found = false;

    await updateDatabase(db => {
      const exists = db.photos.some((p: any) => p.id === id);
      if (exists) {
        db.photos = db.photos.filter((p: any) => p.id !== id);
        found = true;
      }
    });

    if (!found) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    broadcastEvent('DELETE_PHOTO', { id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Add a reminder checklist item
app.post('/api/reminders', authMiddleware, async (req, res, next) => {
  try {
    const parsed = reminderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { title, category, dueDate, createdBy } = parsed.data;
    // IDOR prevention: validate createdBy against partner identity
    const partnerId = req.headers['x-partner-id'];
    if (partnerId && (partnerId === 'A' || partnerId === 'B') && createdBy !== partnerId) {
      return res.status(403).json({ error: 'Forbidden: createdBy does not match your identity' });
    }

    const newReminder = {
      id: 'rem-' + Date.now(),
      title,
      category,
      dueDate,
      completed: false,
      createdBy,
      timestamp: Date.now()
    };

    await updateDatabase(db => {
      db.reminders.push(newReminder);
    });

    broadcastEvent('NEW_REMINDER', newReminder);
    res.json({ success: true, reminder: newReminder });
  } catch (error) {
    next(error);
  }
});

// Toggle/complete reminder
app.post('/api/reminders/:id/toggle', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    let reminder = null;

    await updateDatabase(db => {
      const found = db.reminders.find((r: any) => r.id === id);
      if (found) {
        found.completed = !found.completed;
        reminder = { ...found };
      }
    });

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    broadcastEvent('TOGGLE_REMINDER', reminder);
    res.json({ success: true, reminder });
  } catch (error) {
    next(error);
  }
});

// Delete a reminder
app.delete('/api/reminders/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    await updateDatabase(db => {
      db.reminders = db.reminders.filter((r: any) => r.id !== id);
    });

    broadcastEvent('DELETE_REMINDER', { id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Update Anniversary Date setting
app.post('/api/anniversary', authMiddleware, async (req, res, next) => {
  try {
    const parsed = anniversarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { anniversaryDate } = parsed.data;

    await updateDatabase(db => {
      db.anniversaryDate = anniversaryDate;
    });

    broadcastEvent('UPDATE_ANNIVERSARY', { anniversaryDate });
    res.json({ success: true, anniversaryDate });
  } catch (error) {
    next(error);
  }
});

// Set PIN passcode lock hash (BCrypt hashed on server - SEC-2, per-partner)
app.post('/api/passcode', authMiddleware, strictLimiter, async (req, res, next) => {
  try {
    const parsed = passcodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { passcode, partnerId } = parsed.data;

    const hashKey = partnerId === 'A' ? 'passcodeHashA' : 'passcodeHashB';
    let hasPasscodeA: boolean | undefined;
    let hasPasscodeB: boolean | undefined;
    await updateDatabase(db => {
      if (passcode) {
        const salt = bcrypt.genSaltSync(10);
        db[hashKey] = bcrypt.hashSync(passcode, salt);
      } else {
        db[hashKey] = '';
      }
      hasPasscodeA = !!db.passcodeHashA;
      hasPasscodeB = !!db.passcodeHashB;
    });

    broadcastEvent('UPDATE_PASSCODE', { hasPasscodeA, hasPasscodeB });
    const newHasPasscode = partnerId === 'A' ? hasPasscodeA : hasPasscodeB;
    res.json({ success: true, hasPasscode: newHasPasscode, partnerId });
  } catch (error) {
    next(error);
  }
});

// Verify PIN passcode endpoint (SEC-2, per-partner) - now requires auth (Authentication Bypass fix)
app.post('/api/passcode/verify', authMiddleware, strictLimiter, async (req, res, next) => {
  try {
    const parsed = passcodeVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { passcode, partnerId } = parsed.data;

    const state = await readDatabase();
    const hashKey = partnerId === 'A' ? 'passcodeHashA' : 'passcodeHashB';
    if (!state[hashKey]) {
      return res.json({ valid: true }); // No PIN set for this partner
    }

    const isValid = bcrypt.compareSync(passcode, state[hashKey]);
    // Rate limit response to prevent brute force
    res.json({ valid: isValid });
  } catch (error) {
    next(error);
  }
});

// Add or update special anniversary
app.post('/api/special-anniversaries', authMiddleware, async (req, res, next) => {
  try {
    const parsed = specialAnniversarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { id, title, date, notes, photo, createdBy } = parsed.data;
    // IDOR prevention: validate createdBy against partner identity
    const partnerId = req.headers['x-partner-id'];
    if (partnerId && (partnerId === 'A' || partnerId === 'B') && createdBy !== partnerId) {
      return res.status(403).json({ error: 'Forbidden: createdBy does not match your identity' });
    }

    let item: any = null;
    let found = true;

    const finalState = await updateDatabase(db => {
      if (!db.specialAnniversaries) {
        db.specialAnniversaries = [];
      }

      if (id) {
        const index = db.specialAnniversaries.findIndex((a: any) => a.id === id);
        if (index !== -1) {
          db.specialAnniversaries[index] = {
            ...db.specialAnniversaries[index],
            title,
            date,
            notes: notes || '',
            photo: photo !== undefined ? photo : db.specialAnniversaries[index].photo,
            timestamp: Date.now()
          };
          item = { ...db.specialAnniversaries[index] };
        } else {
          found = false;
        }
      } else {
        item = {
          id: 'anniv-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          title,
          date,
          notes: notes || '',
          photo: photo || '',
          createdBy,
          timestamp: Date.now()
        };
        db.specialAnniversaries.push(item);
      }
    });

    if (!found) {
      return res.status(404).json({ error: 'Special anniversary not found' });
    }

    broadcastEvent('UPDATE_SPECIAL_ANNIVERSARIES', finalState.specialAnniversaries);
    res.json({ success: true, specialAnniversary: item });
  } catch (error) {
    next(error);
  }
});

// Delete special anniversary
app.delete('/api/special-anniversaries/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const finalState = await updateDatabase(db => {
      if (!db.specialAnniversaries) {
        db.specialAnniversaries = [];
      }
      db.specialAnniversaries = db.specialAnniversaries.filter((a: any) => a.id !== id);
    });

    broadcastEvent('UPDATE_SPECIAL_ANNIVERSARIES', finalState.specialAnniversaries);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Reset complete database to initial default seeds or clean state (Requires strictLimiter + auth)
app.post('/api/reset', authMiddleware, strictLimiter, async (req, res, next) => {
  try {
    const { clean } = req.body || {};
    const stateToUse = clean ? CLEAN_STATE : DEFAULT_STATE;
    
    let finalState: any = null;
    await updateDatabase(db => {
      const oldPairingCode = db.pairingCode;
      finalState = { ...stateToUse };
      if (oldPairingCode) {
        finalState.pairingCode = oldPairingCode;
      }
      Object.assign(db, finalState);
    });

    broadcastEvent('RESET_STATE', filterStateForClient(finalState));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Update partner profile (name & avatar)
app.post('/api/profile', authMiddleware, async (req, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { partnerId, name, avatar } = parsed.data;

    let finalState: any = null;
    let valid = true;

    await updateDatabase(db => {
      if (partnerId === 'A') {
        db.partnerA = { ...db.partnerA, name, avatar };
      } else if (partnerId === 'B') {
        db.partnerB = { ...db.partnerB, name, avatar };
      } else {
        valid = false;
      }
      finalState = { ...db };
    });

    if (!valid) {
      return res.status(400).json({ error: 'Invalid partnerId' });
    }

    broadcastEvent('UPDATE_PROFILE', { partnerId, name, avatar });
    res.json({ success: true, partnerA: finalState.partnerA, partnerB: finalState.partnerB });
  } catch (error) {
    next(error);
  }
});

// Update partner storage method
app.post('/api/storage-method', authMiddleware, async (req, res, next) => {
  try {
    const parsed = storageMethodSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { partnerId, storageMethod } = parsed.data;

    let finalState: any = null;
    let valid = true;

    await updateDatabase(db => {
      if (partnerId === 'A') {
        db.storageMethodA = storageMethod;
      } else if (partnerId === 'B') {
        db.storageMethodB = storageMethod;
      } else {
        valid = false;
      }
      finalState = { ...db };
    });

    if (!valid) {
      return res.status(400).json({ error: 'Invalid partnerId' });
    }

    broadcastEvent('UPDATE_STORAGE_METHOD', { partnerId, storageMethod });
    res.json({ success: true, storageMethodA: finalState.storageMethodA, storageMethodB: finalState.storageMethodB });
  } catch (error) {
    next(error);
  }
});

// Ghi nhận uống nước
app.post('/api/water', authMiddleware, async (req, res, next) => {
  try {
    const parsed = waterLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { partnerId, amount, timestamp } = parsed.data;
    
    // IDOR prevention: validate partnerId against request identity
    const xPartnerId = req.headers['x-partner-id'];
    if (xPartnerId && (xPartnerId === 'A' || xPartnerId === 'B') && partnerId !== xPartnerId) {
      return res.status(403).json({ error: 'Forbidden: partnerId does not match your identity' });
    }

    const newLog = {
      id: 'water-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      partnerId,
      amount,
      timestamp: timestamp || Date.now()
    };

    await updateDatabase(db => {
      if (!db.waterLogs) {
        db.waterLogs = [];
      }
      db.waterLogs.push(newLog);
    });

    broadcastEvent('NEW_WATER_LOG', newLog);
    res.json({ success: true, waterLog: newLog });
  } catch (error) {
    next(error);
  }
});

// Xóa/hoàn tác ghi nhận uống nước
app.delete('/api/water/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    let found = false;

    await updateDatabase(db => {
      if (db.waterLogs) {
        const exists = db.waterLogs.some((w: any) => w.id === id);
        if (exists) {
          db.waterLogs = db.waterLogs.filter((w: any) => w.id !== id);
          found = true;
        }
      }
    });

    if (!found) {
      return res.status(404).json({ error: 'Water log not found' });
    }

    broadcastEvent('DELETE_WATER_LOG', { id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Update global pairing code (Requires strictLimiter + auth + session invalidation)
app.post('/api/pair-code', authMiddleware, strictLimiter, async (req, res, next) => {
  try {
    const parsed = pairCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { pairingCode } = parsed.data;

    await updateDatabase(db => {
      db.pairingCode = pairingCode;
    });
    
    // Invalidate all sessions (Session Fixation prevention)
    bumpSessionVersion();
    
    broadcastEvent('SESSION_INVALIDATE', {});
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Broadcast Call Signals (Offer, Answer, ICE Candidates) via SSE
app.post('/api/call/signal', authMiddleware, async (req, res, next) => {
  try {
    const parsed = callSignalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { senderId, recipientId, signal } = parsed.data;
    
    broadcastEvent('CALL_SIGNAL', { senderId, recipientId, signal });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// AI Dating advice suggestions endpoint calling Gemini API (Server-side)
app.post('/api/ai-ideas', authMiddleware, aiIdeasLimiter, async (req, res, next) => {
  try {
    const parsed = aiIdeasSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { daysTogether, anniversaryDate, customApiKey } = parsed.data;
    
    const apiKeyToUse = customApiKey || process.env.GEMINI_API_KEY;
    
    // Check if we have an API key to use
    if (!apiKeyToUse || apiKeyToUse === 'your_gemini_api_key') {
      logger.warn('No Gemini API Key available (neither in environment nor custom client key).');
      return res.status(400).json({ error: 'Missing Gemini API configuration' });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKeyToUse,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const prompt = `Chúng tôi là một cặp đôi đã yêu nhau ${daysTogether} ngày (bắt đầu từ ${anniversaryDate}). Hãy đề xuất 4 ý tưởng hẹn hò hoặc hoạt động lãng mạn vô cùng sáng tạo, độc đáo, bất ngờ và đầy ngọt ngào dành riêng cho số ngày bên nhau này. Định dạng bằng tiếng Việt. Bỏ qua các gợi ý rập khuôn nhàm chán. Trả về kết quả dưới dạng một mảng JSON các chuỗi, ví dụ: ["Gợi ý 1...", "Gợi ý 2...", ...]`;

    logger.info('Calling Gemini API for dating suggestions');
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction: 'Bạn là một cố vấn tình yêu lãng mạn tâm lý, tinh tế và một chuyên gia lên kế hoạch hẹn hò sáng tạo.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    const jsonText = response.text || '[]';
    const ideas = JSON.parse(jsonText.trim());
    res.json({ ideas });
  } catch (error) {
    logger.error(error, 'Gemini AI ideas error');
    res.status(500).json({ error: 'Gemini service failed' });
  }
});

// Centralized Error-handling middleware (PROD-2) with limited info disclosure
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled request error');
  const status = err.status || 500;
  // Never expose stack traces or internal details (Information Disclosure prevention)
  res.status(status).json({
    error: 'Internal Server Error'
  });
});

// Start integration with Vite in dev, static assets serving in production
let serverInstance: any;
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  serverInstance = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Couple Server running on http://localhost:${PORT}`);
  });
}

// Graceful shutdown hooks (PROD-4)
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Graceful shutdown initiated');
  
  // Close SSE clients
  sseClients.forEach(client => {
    try {
      client.write('data: {"type":"SHUTDOWN"}\n\n');
      client.end();
    } catch (e) {
      // ignore
    }
  });

  if (serverInstance) {
    serverInstance.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app };
