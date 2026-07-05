# Security Specification & Threat Analysis

This document outlines the security architecture, threat model, mitigation strategies, and input validation policies implemented in **Duo — Couple App**.

---

## 1. Threat Model & Risk Assessment

| Threat / Vulnerability | Risk | Mitigation Strategy | Implementation |
|---|---|---|---|
| **E2EE Key Leakage** | Critical | Derive key entirely client-side using PBKDF2. Key is never transmitted to the server. | `src/lib/crypto.ts` (`deriveSymmetricKey`) |
| **API Code Spoofing** | High | Authenticate all mutations and state accesses using the unique, user-defined `X-Pairing-Code` HTTP header matching the database state. | `server.ts` (`authMiddleware`) |
| **Plaintext PIN Compromise** | High | Hash user PIN passcodes using BCrypt on the server before database storage. Pin hashes are never returned to clients. | `server.ts` (`/api/passcode` & `/api/passcode/verify`) |
| **Database Concurrency Race** | Medium | Guard database disk read/write access using a memory Mutex. | `server.ts` (`Mutex` from `async-mutex`) |
| **Iframe Sandbox Escape** | Medium | Mount Helmet and configure Content Security Policy (CSP) allowing self-framing and Google domain integration. | `server.ts` (`helmet` middleware) |
| **Denial of Service (DoS)** | Low | Implement global API rate-limiting and strict rate limiters on AI generation and passcode endpoints. | `server.ts` (`express-rate-limit` middleware) |
| **Malformed Payload Injection** | Low | Parse and validate all incoming HTTP bodies using strict schemas before server ingestion. | `server.ts` (`zod` body parsing schemas) |

---

## 2. End-to-End Encryption (E2EE) Details

### Key Derivation
- **Algorithm**: PBKDF2 (Password-Based Key Derivation Function 2)
- **Iterations**: 100,000
- **Hash Function**: SHA-256
- **Salt**: Hashed representation derived from the `pairingCode`
- **Output Key**: AES-GCM 256-bit symmetric key

### Encryption / Decryption
- **Algorithm**: AES-GCM (Advanced Encryption Standard in Galois/Counter Mode)
- **IV Size**: 12 bytes (96-bit) generated using cryptographically strong pseudo-random numbers (`crypto.getRandomValues`).
- **Encrypted Elements**: Messages, photos (Base64 data), photo captions.
- **Web Crypto Fallback**: When `SubtleCrypto` is unavailable (e.g., non-HTTPS or strict sandboxing), the system falls back gracefully to a robust, audited JS implementation to ensure data safety.

---

## 3. Server Validation & Sanitization Checklist

Before processing any requests, the Node/Express server enforces:
1. **X-Pairing-Code Header Validation**: Verifies that `X-Pairing-Code` exists and matches the active pairing code in `db.json`.
2. **Payload Schema Parsing**: Checks that all fields comply with Zod type structures. Reject requests with missing parameters or string sizes exceeding buffers (e.g., base64 limit is 20MB for photos).
3. **Strict Type Coercion**: Numbers must be parsed explicitly. Enums (like partner role `'A'` or `'B'`) must strictly match the subset list.
4. **Error Masking**: Handled errors return general messages in production (e.g., `"Internal Server Error"`). Detailed stacks are only rendered in development environment modes.
