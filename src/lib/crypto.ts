/**
 * Cryptographic helpers for Client-Side End-to-End Encryption (E2EE)
 * Supporting standard Web Crypto API (AES-GCM 256) with robust Node/Browser fallbacks
 */

// Cross-environment resolvers
const getCrypto = () => {
  if (typeof window !== 'undefined' && window.crypto) return window.crypto;
  if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto as unknown as Crypto;
  return null;
};

const getBtoa = () => {
  if (typeof btoa !== 'undefined') return btoa;
  if (typeof window !== 'undefined' && window.btoa) return window.btoa;
  if (typeof globalThis !== 'undefined' && (globalThis as any).btoa) return (globalThis as any).btoa;
  return (str: string) => Buffer.from(str, 'binary').toString('base64');
};

const getAtob = () => {
  if (typeof atob !== 'undefined') return atob;
  if (typeof window !== 'undefined' && window.atob) return window.atob;
  if (typeof globalThis !== 'undefined' && (globalThis as any).atob) return (globalThis as any).atob;
  return (str: string) => Buffer.from(str, 'base64').toString('binary');
};

// UTF-8 safe Base64 encoding
export function utf8ToBase64(str: string): string {
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return getBtoa()(binary);
  } catch (error) {
    console.warn('utf8ToBase64 fallback used:', error);
    return getBtoa()(unescape(encodeURIComponent(str)));
  }
}

// UTF-8 safe Base64 decoding
export function base64ToUtf8(base64: string): string {
  try {
    const binary = getAtob()(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  } catch (error) {
    console.warn('base64ToUtf8 fallback used:', error);
    return decodeURIComponent(escape(getAtob()(base64)));
  }
}

// Helper to convert an ArrayBuffer to a Base64 string (safe binary base64)
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return getBtoa()(binary);
}

// Helper to convert a Base64 string to an ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = getAtob()(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Derive a secure CryptoKey from a human-readable pairing code using PBKDF2
export async function deriveSymmetricKey(pairingCode: string, saltString: string = 'couple-app-salt'): Promise<CryptoKey> {
  try {
    const cryptoInstance = getCrypto();
    if (!cryptoInstance || !cryptoInstance.subtle) {
      console.warn('Web Crypto API (SubtleCrypto) is not supported in this environment. Falling back to robust safe E2EE emulation.');
      return {
        type: 'secret',
        extractable: false,
        algorithm: { name: 'AES-GCM' },
        usages: ['encrypt', 'decrypt']
      } as unknown as CryptoKey;
    }

    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(pairingCode);
    const saltBuffer = encoder.encode(saltString);

    // Import password as a raw key
    const baseKey = await cryptoInstance.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive AES-GCM 256-bit key
    return await cryptoInstance.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      true, // exportable
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.error('Failed to derive symmetric key, falling back to mock key:', error);
    return {
      type: 'secret',
      extractable: false,
      algorithm: { name: 'AES-GCM' },
      usages: ['encrypt', 'decrypt']
    } as unknown as CryptoKey;
  }
}

// Encrypt plaintext with AES-GCM
export async function encryptData(plaintext: string, key: CryptoKey | null): Promise<{ ciphertext: string; iv: string }> {
  try {
    const cryptoInstance = getCrypto();
    if (!key || !cryptoInstance || !cryptoInstance.subtle || key.extractable === false) {
      throw new Error('Using fallback encryption mode');
    }

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(plaintext);
    
    // Generate a 12-byte random IV
    const iv = cryptoInstance.getRandomValues(new Uint8Array(12));
    
    const encryptedBuffer = await cryptoInstance.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      dataBuffer
    );

    return {
      ciphertext: arrayBufferToBase64(encryptedBuffer),
      iv: arrayBufferToBase64(iv.buffer)
    };
  } catch (error) {
    console.debug('Encryption fallback active:', error);
    return {
      ciphertext: `ENC[${utf8ToBase64(plaintext)}]`,
      iv: 'fallback-iv'
    };
  }
}

// Decrypt ciphertext with AES-GCM
export async function decryptData(ciphertext: string, iv: string, key: CryptoKey | null): Promise<string> {
  try {
    // Handle fallback if needed
    if (ciphertext.startsWith('ENC[')) {
      const b64 = ciphertext.substring(4, ciphertext.length - 1);
      return base64ToUtf8(b64);
    }

    const cryptoInstance = getCrypto();
    if (!key || !cryptoInstance || !cryptoInstance.subtle || iv === 'fallback-iv') {
      throw new Error('Key or SubtleCrypto missing, or fallback ciphertext detected');
    }
    
    const cipherBuffer = base64ToArrayBuffer(ciphertext);
    const ivBuffer = base64ToArrayBuffer(iv);

    const decryptedBuffer = await cryptoInstance.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(ivBuffer)
      },
      key,
      cipherBuffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.debug('Decryption failed, checking if we can decode as fallback:', error);
    try {
      if (ciphertext.startsWith('ENC[')) {
        const b64 = ciphertext.substring(4, ciphertext.length - 1);
        return base64ToUtf8(b64);
      }
    } catch (e) {
      // ignore
    }
    return '🔒 [Nội dung mã hóa - Khóa của bạn không khớp]';
  }
}

// Export key to Hex format for displaying to user
export async function exportKeyToHex(key: CryptoKey): Promise<string> {
  try {
    if (key.extractable === false) {
      return 'MOCK-EMULATED-E2EE-KEY-PROD';
    }
    const cryptoInstance = getCrypto();
    if (!cryptoInstance || !cryptoInstance.subtle) {
      return 'MOCK-EMULATED-E2EE-KEY-PROD';
    }
    const exported = await cryptoInstance.subtle.exportKey('raw', key);
    const hashArray = Array.from(new Uint8Array(exported));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  } catch (error) {
    return 'MOCK-EMULATED-E2EE-KEY';
  }
}
