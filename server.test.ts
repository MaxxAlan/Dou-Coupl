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
      db.storageMethodA = 'googledrive';
      db.storageMethodB = 'googledrive';
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

  it('GET /api/state with valid X-Pairing-Code should hide pairingCode and passcode hashes', async () => {
    const res = await request(app)
      .get('/api/state')
      .set('X-Pairing-Code', pairingCode);
    expect(res.status).toBe(200);
    expect(res.body.pairingCode).toBeUndefined();
    expect(res.body.passcodeHash).toBeUndefined();
    expect(res.body.passcodeHashA).toBeUndefined();
    expect(res.body.passcodeHashB).toBeUndefined();
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

  it('GET /api/csrf-token should return a token (CSRF protection)', async () => {
    const res = await request(app).get('/api/csrf-token');
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeDefined();
    expect(typeof res.body.csrfToken).toBe('string');
  });

  it('POST /api/passcode/verify should now require auth (Authentication Bypass fix)', async () => {
    // Without auth - should fail
    const resNoAuth = await request(app)
      .post('/api/passcode/verify')
      .send({ passcode: '1234', partnerId: 'A' });
    expect(resNoAuth.status).toBe(401);

    // With auth - should succeed (partner has no PIN set, returns valid: true)
    const resWithAuth = await request(app)
      .post('/api/passcode/verify')
      .set('X-Pairing-Code', pairingCode)
      .send({ passcode: '1234', partnerId: 'A' });
    expect(resWithAuth.status).toBe(200);
    expect(resWithAuth.body.valid).toBe(true);
  });

  it('POST /api/messages should reject senderId mismatch (IDOR prevention)', async () => {
    // Set X-Partner-Id=A but send senderId=B
    const res = await request(app)
      .post('/api/messages')
      .set('X-Pairing-Code', pairingCode)
      .set('X-Partner-Id', 'A')
      .send({
        senderId: 'B', // Does not match X-Partner-Id
        ciphertext: 'base64ciphertext',
        iv: 'ivstring'
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('senderId does not match');
  });

  it('POST /api/reminders should reject createdBy mismatch (IDOR prevention)', async () => {
    const res = await request(app)
      .post('/api/reminders')
      .set('X-Pairing-Code', pairingCode)
      .set('X-Partner-Id', 'B')
      .send({
        title: 'Test',
        category: 'daily',
        dueDate: '2026-10-15',
        createdBy: 'A' // Does not match X-Partner-Id=B
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('createdBy does not match');
  });

  it('Should reject invalid X-Pairing-Code format (Header Injection prevention)', async () => {
    const res = await request(app)
      .get('/api/state')
      .set('X-Pairing-Code', '<script>alert(1)</script>');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid X-Pairing-Code format');
  });

  it('POST /api/ai-ideas should require auth (Authentication Bypass fix)', async () => {
    const res = await request(app)
      .post('/api/ai-ideas')
      .send({
        daysTogether: 100,
        anniversaryDate: '2026-01-01'
      });
    expect(res.status).toBe(401);
  });

  it('POST /api/pair-code should not return the new pairing code (Secret Leakage fix)', async () => {
    const res = await request(app)
      .post('/api/pair-code')
      .set('X-Pairing-Code', pairingCode)
      .send({ pairingCode: 'NEW-TEST-CODE' });
    expect(res.status).toBe(200);
    expect(res.body.pairingCode).toBeUndefined();
    expect(res.body.success).toBe(true);
    // Reset pairing code back
    await request(app)
      .post('/api/pair-code')
      .set('X-Pairing-Code', 'NEW-TEST-CODE')
      .send({ pairingCode });
  });

  it('Passcode settings and verification (SEC-2)', async () => {
    // 1. Set PIN to '1234' (now requires partnerId)
    const setRes = await request(app)
      .post('/api/passcode')
      .set('X-Pairing-Code', pairingCode)
      .send({ passcode: '1234', partnerId: 'A' });
    expect(setRes.status).toBe(200);
    expect(setRes.body.hasPasscode).toBe(true);

    // 2. State hasPasscode check (per-partner now)
    const stateRes = await request(app)
      .get('/api/state')
      .set('X-Pairing-Code', pairingCode);
    expect(stateRes.body.hasPasscodeA).toBe(true);

    // 3. Verify correct PIN (now with auth)
    const verifyCorrect = await request(app)
      .post('/api/passcode/verify')
      .set('X-Pairing-Code', pairingCode)
      .send({ passcode: '1234', partnerId: 'A' });
    expect(verifyCorrect.status).toBe(200);
    expect(verifyCorrect.body.valid).toBe(true);

    // 4. Verify incorrect PIN and check failed attempts / lock out behavior
    const fail1 = await request(app)
      .post('/api/passcode/verify')
      .set('X-Pairing-Code', pairingCode)
      .send({ passcode: '5555', partnerId: 'A', email: 'test@example.com' });
    expect(fail1.status).toBe(200);
    expect(fail1.body.valid).toBe(false);
    expect(fail1.body.attemptsRemaining).toBe(2);

    const fail2 = await request(app)
      .post('/api/passcode/verify')
      .set('X-Pairing-Code', pairingCode)
      .send({ passcode: '5555', partnerId: 'A', email: 'test@example.com' });
    expect(fail2.status).toBe(200);
    expect(fail2.body.valid).toBe(false);
    expect(fail2.body.attemptsRemaining).toBe(1);

    const fail3 = await request(app)
      .post('/api/passcode/verify')
      .set('X-Pairing-Code', pairingCode)
      .send({ passcode: '5555', partnerId: 'A', email: 'test@example.com' });
    expect(fail3.status).toBe(200);
    expect(fail3.body.valid).toBe(false);
    expect(fail3.body.locked).toBe(true);
    expect(fail3.body.message).toContain('gửi tới email');

    // 4.1. Verify that old passcode '1234' is now invalid (it was reset)
    const oldPinVerify = await request(app)
      .post('/api/passcode/verify')
      .set('X-Pairing-Code', pairingCode)
      .send({ passcode: '1234', partnerId: 'A' });
    expect(oldPinVerify.body.valid).toBe(false);

    // 5. Clear PIN
    const clearRes = await request(app)
      .post('/api/passcode')
      .set('X-Pairing-Code', pairingCode)
      .send({ passcode: '', partnerId: 'A' });
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
