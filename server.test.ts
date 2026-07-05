import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from './server';
import fs from 'fs/promises';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'db.json');

describe('Express Server API Integration Tests', () => {
  const pairingCode = 'DUO-2026-LOVE';

  // Seed baseline db before running tests
  beforeAll(async () => {
    try {
      const data = await fs.readFile(DB_FILE, 'utf-8');
      const db = JSON.parse(data);
      // Ensure pairingCode is matching
      db.pairingCode = pairingCode;
      db.passcodeHash = ''; // Start clean
      db.reminders = []; // Reset reminders for clean concurrency test
      await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
      // ignore
    }
  });

  it('GET /health should return 200 and ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptime).toBeDefined();
  });

  it('GET /api/state without X-Pairing-Code should return 401', async () => {
    const res = await request(app).get('/api/state');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('X-Pairing-Code');
  });

  it('GET /api/state with invalid X-Pairing-Code should return 401', async () => {
    const res = await request(app)
      .get('/api/state')
      .set('X-Pairing-Code', 'INVALID-CODE');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid pairing code');
  });

  it('GET /api/state with valid X-Pairing-Code should hide pairingCode and passcodeHash', async () => {
    const res = await request(app)
      .get('/api/state')
      .set('X-Pairing-Code', pairingCode);
    expect(res.status).toBe(200);
    expect(res.body.pairingCode).toBeUndefined();
    expect(res.body.passcodeHash).toBeUndefined();
    expect(res.body.hasPasscode).toBe(false);
  });

  it('POST /api/messages should parse schema and validate input', async () => {
    // Valid body
    const resValid = await request(app)
      .post('/api/messages')
      .set('X-Pairing-Code', pairingCode)
      .send({
        senderId: 'A',
        ciphertext: 'base64ciphertext',
        iv: 'ivstring'
      });
    expect(resValid.status).toBe(200);
    expect(resValid.body.success).toBe(true);

    // Invalid body
    const resInvalid = await request(app)
      .post('/api/messages')
      .set('X-Pairing-Code', pairingCode)
      .send({
        senderId: 'INVALID_PARTNER',
        ciphertext: '',
        iv: ''
      });
    expect(resInvalid.status).toBe(400);
    expect(resInvalid.body.error).toBe('Validation failed');
  });

  it('Passcode settings and verification (SEC-2)', async () => {
    // 1. Set PIN to '1234'
    const setRes = await request(app)
      .post('/api/passcode')
      .set('X-Pairing-Code', pairingCode)
      .send({ passcode: '1234' });
    expect(setRes.status).toBe(200);
    expect(setRes.body.hasPasscode).toBe(true);

    // 2. State hasPasscode check
    const stateRes = await request(app)
      .get('/api/state')
      .set('X-Pairing-Code', pairingCode);
    expect(stateRes.body.hasPasscode).toBe(true);

    // 3. Verify correct PIN
    const verifyCorrect = await request(app)
      .post('/api/passcode/verify')
      .send({ passcode: '1234' });
    expect(verifyCorrect.status).toBe(200);
    expect(verifyCorrect.body.valid).toBe(true);

    // 4. Verify incorrect PIN
    const verifyIncorrect = await request(app)
      .post('/api/passcode/verify')
      .send({ passcode: '5555' });
    expect(verifyIncorrect.status).toBe(200);
    expect(verifyIncorrect.body.valid).toBe(false);

    // 5. Clear PIN
    const clearRes = await request(app)
      .post('/api/passcode')
      .set('X-Pairing-Code', pairingCode)
      .send({ passcode: '' });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.hasPasscode).toBe(false);
  });

  it('Concurrency test with Mutex writes (DATA-1)', async () => {
    // Send 5 parallel reminder creation requests
    const promises = Array.from({ length: 5 }).map((_, idx) => {
      return request(app)
        .post('/api/reminders')
        .set('X-Pairing-Code', pairingCode)
        .send({
          title: `Concurrent Reminder ${idx}`,
          category: 'daily',
          dueDate: '2026-10-15',
          createdBy: 'A'
        });
    });

    const responses = await Promise.all(promises);
    responses.forEach(res => {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    // Check database file content to make sure all 5 are written and no collision
    const stateRes = await request(app)
      .get('/api/state')
      .set('X-Pairing-Code', pairingCode);
    
    const concurrentReminders = stateRes.body.reminders.filter((r: any) =>
      r.title.startsWith('Concurrent Reminder')
    );
    expect(concurrentReminders.length).toBe(5);
  });
});
