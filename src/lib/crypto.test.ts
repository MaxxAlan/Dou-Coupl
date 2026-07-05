import { describe, it, expect } from 'vitest';
import { deriveSymmetricKey, encryptData, decryptData, exportKeyToHex } from './crypto';

describe('E2EE Cryptography Module', () => {
  const testPairingCode = 'TEST-LOVE-2026';
  const testMessage = 'Chào em, hôm nay thế nào? E2EE working!';

  it('should derive symmetric key from pairing code', async () => {
    const key = await deriveSymmetricKey(testPairingCode);
    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it('should export key to a valid hex string', async () => {
    const key = await deriveSymmetricKey(testPairingCode);
    const hex = await exportKeyToHex(key);
    expect(hex).toBeDefined();
    expect(hex.length).toBe(64); // 256 bits = 32 bytes = 64 hex characters
    expect(/^[0-9a-fA-F]+$/.test(hex)).toBe(true);
  });

  it('should encrypt and decrypt a message successfully', async () => {
    const key = await deriveSymmetricKey(testPairingCode);
    
    // Encrypt
    const encrypted = await encryptData(testMessage, key);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.ciphertext).not.toBe(testMessage);

    // Decrypt
    const decrypted = await decryptData(encrypted.ciphertext, encrypted.iv, key);
    expect(decrypted).toBe(testMessage);
  });

  it('should fail to decrypt with an incorrect key', async () => {
    const keyCorrect = await deriveSymmetricKey(testPairingCode);
    const keyIncorrect = await deriveSymmetricKey('DIFFERENT-CODE-123');

    const encrypted = await encryptData(testMessage, keyCorrect);
    
    const result = await decryptData(encrypted.ciphertext, encrypted.iv, keyIncorrect);
    expect(result).toBe('🔒 [Nội dung mã hóa - Khóa của bạn không khớp]');
  });
});
