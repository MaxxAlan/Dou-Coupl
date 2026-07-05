import express from 'express';
import path from 'path';
import fs from 'fs/promises';
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

// Security check helper
import { DEFAULT_STATE, CLEAN_STATE } from './src/lib/demoData';

// Zod schemas for input validation
const messageSchema = z.object({
  senderId: z.enum(['A', 'B']),
  ciphertext: z.string().min(1).max(5000000), // Max 5MB
  iv: z.string().min(1).max(256),
  type: z.enum(['text', 'image_ref']).optional()
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
  passcode: z.string().max(100) // Will be hashed on server. Send empty string to clear.
});

const passcodeVerifySchema = z.object({
  passcode: z.string().min(1).max(100)
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

// Configure Helmet with friendly CSP for AI Studio framing
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://*.googleusercontent.com", "https://*.google.com"],
      connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseapp.com", "https://*.firebasestorage.app", "wss://*.firebaseapp.com", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://dou-coupl.onrender.com", "https://dou-coupl.web.app"],
      frameAncestors: ["'self'", "*"],
    },
  },
  crossOriginEmbedderPolicy: false,
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

// Broadcast event to all SSE clients
function broadcastEvent(type: string, data: any) {
  const payload = JSON.stringify({ type, data });
  logger.debug({ type }, 'Broadcasting SSE event');
  sseClients.forEach(client => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (e) {
      // Clean up failed client connections
    }
  });
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

// Strips out pairingCode and passcodeHash before returning state to client (SEC-1 / SEC-2)
function filterStateForClient(state: any) {
  const cleanState = { ...state };
  delete cleanState.pairingCode;
  delete cleanState.passcodeHash;
  cleanState.hasPasscode = !!state.passcodeHash;
  return cleanState;
}

// Minimal authentication middleware via X-Pairing-Code (SEC-3)
async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const clientCode = req.headers['x-pairing-code'] || req.query.pairingCode;
    if (!clientCode) {
      logger.warn({ path: req.path }, 'Request blocked: missing X-Pairing-Code header');
      return res.status(401).json({ error: 'Unauthorized: Missing X-Pairing-Code header' });
    }
    const state = await readDatabase();
    if (state.pairingCode !== clientCode) {
      logger.warn({ path: req.path }, 'Request blocked: invalid pairing code');
      return res.status(401).json({ error: 'Unauthorized: Invalid pairing code' });
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

// Event Stream (SSE) for Realtime updates. Validates pairing code in query param.
app.get('/api/events', async (req, res, next) => {
  try {
    const clientCode = req.query.pairingCode;
    if (!clientCode) {
      return res.status(401).json({ error: 'Unauthorized: Missing pairingCode query parameter' });
    }
    const state = await readDatabase();
    if (state.pairingCode !== clientCode) {
      return res.status(401).json({ error: 'Unauthorized: Invalid pairing code' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write('data: {"type":"CONNECTED"}\n\n');
    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter(client => client !== res);
      
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
      }, 4000); // 4 seconds delay for refresh tolerance
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
    const { senderId, ciphertext, iv, type } = parsed.data;

    const newMessage = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      senderId,
      ciphertext,
      iv,
      timestamp: Date.now(),
      type: type || 'text'
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

// Set PIN passcode lock hash (BCrypt hashed on server - SEC-2)
app.post('/api/passcode', authMiddleware, strictLimiter, async (req, res, next) => {
  try {
    const parsed = passcodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { passcode } = parsed.data;

    let hasPasscode = false;
    await updateDatabase(db => {
      if (passcode) {
        const salt = bcrypt.genSaltSync(10);
        db.passcodeHash = bcrypt.hashSync(passcode, salt);
        hasPasscode = true;
      } else {
        db.passcodeHash = '';
        hasPasscode = false;
      }
    });

    broadcastEvent('UPDATE_PASSCODE', { hasPasscode });
    res.json({ success: true, hasPasscode });
  } catch (error) {
    next(error);
  }
});

// Verify PIN passcode endpoint (SEC-2)
app.post('/api/passcode/verify', strictLimiter, async (req, res, next) => {
  try {
    const parsed = passcodeVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { passcode } = parsed.data;

    const state = await readDatabase();
    if (!state.passcodeHash) {
      return res.json({ valid: true }); // No PIN set
    }

    const isValid = bcrypt.compareSync(passcode, state.passcodeHash);
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

// Update global pairing code (Requires strictLimiter + auth check on the header of the OLD pairing code)
app.post('/api/pair-code', authMiddleware, strictLimiter, async (req, res, next) => {
  try {
    const parsed = pairCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }
    const { pairingCode } = parsed.data;

    let finalState: any = null;
    await updateDatabase(db => {
      db.pairingCode = pairingCode;
      finalState = { ...db };
    });
    
    broadcastEvent('RESET_STATE', filterStateForClient(finalState));
    res.json({ success: true, pairingCode: finalState.pairingCode });
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
app.post('/api/ai-ideas', aiIdeasLimiter, async (req, res, next) => {
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

// Centralized Error-handling middleware (PROD-2)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err, 'Unhandled request error');
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : err.message || 'Internal Server Error';
  
  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
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
