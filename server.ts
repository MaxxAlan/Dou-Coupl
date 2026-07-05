import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'db.json');

app.use(express.json({ limit: '10mb' }));

import { DEFAULT_STATE, CLEAN_STATE } from './src/lib/demoData';

// Server-Sent Events clients registry
let sseClients: any[] = [];

// Broadcast event to all SSE clients
function broadcastEvent(type: string, data: any) {
  const payload = JSON.stringify({ type, data });
  sseClients.forEach(client => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch (e) {
      // Clean up failed client connections
    }
  });
}

// Database read/write utilities
async function readDatabase() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, seed default database
    await fs.writeFile(DB_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
    return DEFAULT_STATE;
  }
}

async function writeDatabase(state: any) {
  await fs.writeFile(DB_FILE, JSON.stringify(state, null, 2));
}

// REST API Router Definitions

// Event Stream (SSE) for Realtime updates
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial signal
  res.write('data: {"type":"CONNECTED"}\n\n');
  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
    
    // Check if both went offline and storageMethod is P2P
    setTimeout(async () => {
      if (sseClients.length === 0) {
        try {
          const state = await readDatabase();
          if (state.storageMethodA === 'p2p' || state.storageMethodB === 'p2p') {
            state.messages = [];
            state.photos = [];
            state.reminders = [];
            await writeDatabase(state);
            console.log('[P2P Storage] All clients offline. Cleared persistent E2EE messages, photos & reminders.');
          }
        } catch (e) {
          console.error('Error auto-clearing P2P data:', e);
        }
      }
    }, 4000); // 4 seconds delay for refresh tolerance
  });
});

// Fetch complete app state
app.get('/api/state', async (req, res) => {
  try {
    const state = await readDatabase();
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database state' });
  }
});

// Post a secure message
app.post('/api/messages', async (req, res) => {
  try {
    const { senderId, ciphertext, iv, type } = req.body;
    if (!senderId || !ciphertext || !iv) {
      return res.status(400).json({ error: 'Missing encrypt params' });
    }

    const state = await readDatabase();
    const newMessage = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      senderId,
      ciphertext,
      iv,
      timestamp: Date.now(),
      type: type || 'text'
    };

    state.messages.push(newMessage);
    await writeDatabase(state);

    // Notify clients real-time
    broadcastEvent('NEW_MESSAGE', newMessage);
    res.json({ success: true, message: newMessage });
  } catch (error) {
    res.status(500).json({ error: 'Failed to post message' });
  }
});

// Post a secure photo to Album
app.post('/api/photos', async (req, res) => {
  try {
    const { senderId, ciphertext, iv, isViewOnce, captionCiphertext, captionIv } = req.body;
    if (!senderId || !ciphertext || !iv) {
      return res.status(400).json({ error: 'Missing image encrypt params' });
    }

    const state = await readDatabase();
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

    state.photos.push(newPhoto);
    await writeDatabase(state);

    broadcastEvent('NEW_PHOTO', newPhoto);
    res.json({ success: true, photo: newPhoto });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// Delete photo (Manual delete or View Once destruction)
app.delete('/api/photos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const state = await readDatabase();
    const photoToDelete = state.photos.find((p: any) => p.id === id);

    if (!photoToDelete) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    state.photos = state.photos.filter((p: any) => p.id !== id);
    await writeDatabase(state);

    broadcastEvent('DELETE_PHOTO', { id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// Add a reminder checklist item
app.post('/api/reminders', async (req, res) => {
  try {
    const { title, category, dueDate, createdBy } = req.body;
    if (!title || !category || !dueDate || !createdBy) {
      return res.status(400).json({ error: 'Missing reminder params' });
    }

    const state = await readDatabase();
    const newReminder = {
      id: 'rem-' + Date.now(),
      title,
      category,
      dueDate,
      completed: false,
      createdBy,
      timestamp: Date.now()
    };

    state.reminders.push(newReminder);
    await writeDatabase(state);

    broadcastEvent('NEW_REMINDER', newReminder);
    res.json({ success: true, reminder: newReminder });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add reminder' });
  }
});

// Toggle/complete reminder
app.post('/api/reminders/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const state = await readDatabase();
    const reminder = state.reminders.find((r: any) => r.id === id);

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    reminder.completed = !reminder.completed;
    await writeDatabase(state);

    broadcastEvent('TOGGLE_REMINDER', reminder);
    res.json({ success: true, reminder });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle reminder' });
  }
});

// Delete a reminder
app.delete('/api/reminders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const state = await readDatabase();
    state.reminders = state.reminders.filter((r: any) => r.id !== id);
    await writeDatabase(state);

    broadcastEvent('DELETE_REMINDER', { id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

// Update Anniversary Date setting
app.post('/api/anniversary', async (req, res) => {
  try {
    const { anniversaryDate } = req.body;
    if (!anniversaryDate) {
      return res.status(400).json({ error: 'Missing anniversaryDate' });
    }

    const state = await readDatabase();
    state.anniversaryDate = anniversaryDate;
    await writeDatabase(state);

    broadcastEvent('UPDATE_ANNIVERSARY', { anniversaryDate });
    res.json({ success: true, anniversaryDate });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save anniversary date' });
  }
});

// Set PIN passcode lock hash
app.post('/api/passcode', async (req, res) => {
  try {
    const { passcodeHash } = req.body;
    const state = await readDatabase();
    state.passcodeHash = passcodeHash || '';
    await writeDatabase(state);

    broadcastEvent('UPDATE_PASSCODE', { hasPasscode: !!passcodeHash });
    res.json({ success: true, hasPasscode: !!passcodeHash });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save passcode settings' });
  }
});

// Add or update special anniversary
app.post('/api/special-anniversaries', async (req, res) => {
  try {
    const { id, title, date, notes, photo, createdBy } = req.body;
    if (!title || !date || !createdBy) {
      return res.status(400).json({ error: 'Missing special anniversary params' });
    }

    const state = await readDatabase();
    if (!state.specialAnniversaries) {
      state.specialAnniversaries = [];
    }

    let item;
    if (id) {
      // Update existing
      const index = state.specialAnniversaries.findIndex((a: any) => a.id === id);
      if (index !== -1) {
        state.specialAnniversaries[index] = {
          ...state.specialAnniversaries[index],
          title,
          date,
          notes,
          photo: photo !== undefined ? photo : state.specialAnniversaries[index].photo,
          timestamp: Date.now()
        };
        item = state.specialAnniversaries[index];
      } else {
        return res.status(404).json({ error: 'Special anniversary not found' });
      }
    } else {
      // Create new
      item = {
        id: 'anniv-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        title,
        date,
        notes,
        photo,
        createdBy,
        timestamp: Date.now()
      };
      state.specialAnniversaries.push(item);
    }

    await writeDatabase(state);
    broadcastEvent('UPDATE_SPECIAL_ANNIVERSARIES', state.specialAnniversaries);
    res.json({ success: true, specialAnniversary: item });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save special anniversary' });
  }
});

// Delete special anniversary
app.delete('/api/special-anniversaries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const state = await readDatabase();
    if (!state.specialAnniversaries) {
      state.specialAnniversaries = [];
    }

    state.specialAnniversaries = state.specialAnniversaries.filter((a: any) => a.id !== id);
    await writeDatabase(state);

    broadcastEvent('UPDATE_SPECIAL_ANNIVERSARIES', state.specialAnniversaries);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete special anniversary' });
  }
});

// Reset complete database to initial default seeds or clean state
app.post('/api/reset', async (req, res) => {
  try {
    const { clean } = req.body || {};
    const stateToUse = clean ? CLEAN_STATE : DEFAULT_STATE;
    await writeDatabase(stateToUse);
    broadcastEvent('RESET_STATE', stateToUse);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset database' });
  }
});

// Update partner profile (name & avatar)
app.post('/api/profile', async (req, res) => {
  try {
    const { partnerId, name, avatar } = req.body;
    if (!partnerId || !name || !avatar) {
      return res.status(400).json({ error: 'Missing profile params' });
    }

    const state = await readDatabase();
    if (partnerId === 'A') {
      state.partnerA = { ...state.partnerA, name, avatar };
    } else if (partnerId === 'B') {
      state.partnerB = { ...state.partnerB, name, avatar };
    } else {
      return res.status(400).json({ error: 'Invalid partnerId' });
    }

    await writeDatabase(state);
    broadcastEvent('UPDATE_PROFILE', { partnerId, name, avatar });
    res.json({ success: true, partnerA: state.partnerA, partnerB: state.partnerB });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update partner profile' });
  }
});

// Update partner storage method
app.post('/api/storage-method', async (req, res) => {
  try {
    const { partnerId, storageMethod } = req.body;
    if (!partnerId || !storageMethod) {
      return res.status(400).json({ error: 'Missing storage method parameters' });
    }

    const state = await readDatabase();
    if (partnerId === 'A') {
      state.storageMethodA = storageMethod;
    } else if (partnerId === 'B') {
      state.storageMethodB = storageMethod;
    } else {
      return res.status(400).json({ error: 'Invalid partnerId' });
    }

    await writeDatabase(state);
    broadcastEvent('UPDATE_STORAGE_METHOD', { partnerId, storageMethod });
    res.json({ success: true, storageMethodA: state.storageMethodA, storageMethodB: state.storageMethodB });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update storage method' });
  }
});

// Update global pairing code
app.post('/api/pair-code', async (req, res) => {
  try {
    const { pairingCode } = req.body;
    if (!pairingCode) {
      return res.status(400).json({ error: 'Missing pairing code' });
    }

    const state = await readDatabase();
    state.pairingCode = pairingCode;
    await writeDatabase(state);
    
    broadcastEvent('RESET_STATE', state); // Broadcast full reset to sync keys
    res.json({ success: true, pairingCode: state.pairingCode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update pairing code' });
  }
});

// AI Dating advice suggestions endpoint calling Gemini API (Server-side)
app.post('/api/ai-ideas', async (req, res) => {
  try {
    const { daysTogether, anniversaryDate, customApiKey } = req.body;
    
    const apiKeyToUse = customApiKey || process.env.GEMINI_API_KEY;
    
    // Check if we have an API key to use
    if (!apiKeyToUse) {
      console.warn('No Gemini API Key available (neither in environment nor custom client key).');
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
    console.error('Gemini AI ideas error:', error);
    res.status(500).json({ error: 'Gemini service failed' });
  }
});

// Start integration with Vite in dev, static assets serving in production
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Couple Server running on http://localhost:${PORT}`);
  });
}

startServer();
