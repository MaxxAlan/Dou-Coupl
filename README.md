# Duo — Couple App (E2EE) 🔒❤️

[English](README.md) | [简体中文](README.zh.md) | [Tiếng Việt](README.vi.md)

An end-to-end encrypted (E2EE) secure web application designed for couples to share messages, moment photos (Locket), track daily hydration, manage shared plans, and get personalized date recommendations powered by Gemini AI.

The project is highly optimized for both Mobile Web and Desktop devices with an elegant, premium user interface, backed by a robust real-time synchronization mechanism.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18, Vite
- **Styling**: TailwindCSS, CSS Variables (Dark theme with luxury sand-gold neon accents)
- **Animations**: Motion (Framer Motion)
- **Icons**: Lucide React

### Backend
- **Server**: Node.js + Express
- **Real-time Sync**: Server-Sent Events (SSE)
- **Database**: Firebase (Firestore for onboarding and auth/metadata), Local flat-file JSON database `db.json` for shared couple data.

### Security & Encryption
- **Cryptography**: Web Crypto API (PBKDF2, AES-GCM-256)
- **PIN Verification**: Bcrypt (Server-side hashing)
- **Data Validation**: Zod Schema validation
- **Concurrency Control**: Memory Mutex (`async-mutex`)
- **Anti-Replay & CSRF**: Nonce + Timestamp + CSRF Token
- **Security Headers**: Helmet CSP (Content Security Policy)

---

## 🔐 Security Architecture & E2EE

The application strictly adheres to the Zero-Knowledge security model:
- **Key Derivation**: Symmetric encryption keys are generated entirely client-side. The key is derived using the **PBKDF2** algorithm (100,000 iterations) from the invitation pairing code (`pairingCode`) and a secure salt. This key exists only in the device's RAM and is never sent to the server.
- **Encryption**: All chat messages, Locket moments, and captions are encrypted locally via **AES-GCM-256** before being uploaded to the server.
- **Partner Isolation**: Partners operate within a shared space but function independently. The PIN lock (`passcode`) settings are hashed using `bcrypt` server-side and authenticated indirectly through a secure endpoint to prevent key exposure.
- **Threat Mitigation**:
  - **XSS**: React automatically escapes text inputs; strict input schemas are validated.
  - **Path Traversal**: Read operations on the flat `db.json` file use immutable, absolute file paths.
  - **Prototype Pollution**: Zod Schema strips away all redundant and matching-violating fields.

---

## ✨ Features

### 1. Secret Chat
- Send text or voice messages (Voice Messages) with full E2EE.
- Support "View Once" mode, which automatically deletes messages permanently from the server after they are opened.
- Real-time Crypto Inspector on the UI allows viewing plaintext, ciphertext, and the raw hex AES-GCM key.

### 2. Hydration Hub
- Track shared daily water drinking goals and progress.
- Quick add options with 5 preset amounts: `250ml`, `350ml`, `500ml`, `750ml`, `1L`.
- **Photo Verification**: When logging water intake, users can choose to open their camera, take a verification photo, and automatically upload the E2EE-encrypted photo to the Locket photo grid.

### 3. Locket Album
- A real-time photo grid storing memorable moments.
- Supports backing up encrypted photo data directly to each partner's personal Google Drive instead of storing it on the public server.

### 4. Plans & Anniversary
- Todo list manager (TodoList) sorted by due dates.
- Keep track of days spent together with custom milestone badges.
- **Gemini AI Advisor**: Suggests unique dating ideas tailored to your relationship duration.

---

## 🚀 Setup & Local Installation

# 🎥 Demo Video
[![Duo Couple App Demo](https://github.com/user-attachments/assets/c30da2d6-15de-420f-bd6c-3fcb6f2c3493)](https://youtu.be/njZ_hRffWyM)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Copy the template file to create `.env`:
```bash
cp .env.example .env
```
Open the newly created `.env` file and configure the required keys:
```env
PORT=3000
NODE_ENV=development
GEMINI_API_KEY=your_gemini_api_key

# Firebase Client Settings (used for Onboarding / Auth)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Run in Development mode
```bash
npm run dev
```
Access the application at: `http://localhost:3000`

### 4. Build for Production
To compile and package the app for production:
```bash
npm run build
```

### 5. Start Production server
```bash
npm run start
```

---

## 📦 Main Directory Structure
- `server.ts`: Express backend entry point, API endpoints, and Server-Sent Events (SSE) stream.
- `src/App.tsx`: Main application controller, handles state and SSE streaming.
- `src/components/`: Modular tab components (`ChatTab.tsx`, `AlbumTab.tsx`, `SecurityHub.tsx`, etc.).
- `src/lib/`:
  - `crypto.ts`: Core functions for symmetric encryption/decryption, and PBKDF2 key generation.
  - `apiClient.ts`: Shareable HTTP API Client class.
  - `storage.ts`: Centralized browser `localStorage` management.
- `db.json`: Flat-file local simulated database.

---

## 📄 License & Development
The application is developed by **MaxxAlan**. For any contributions or bug reports, please open an issue in the project repository.
