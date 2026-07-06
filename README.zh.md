# Duo — 情侣应用 (E2EE) 🔒❤️

[English](README.md) | [简体中文](README.zh.md) | [Tiếng Việt](README.vi.md)

这是一款专门为情侣设计的端到端加密 (E2EE) 安全网页应用，支持分享加密聊天消息、瞬间照片 (Locket)、每日饮水追踪 (Hydration Hub)、共同待办事项与纪念日管理，并提供基于 Gemini AI 的智能约会灵感推荐。

本项目针对移动端 (Mobile Web) 与电脑端 (Desktop) 进行了适配与优化，界面精美奢华，并配有强大的实时 (Realtime) 数据同步机制。

---

## 🛠️ 所用技术栈

### 前端 (Frontend)
- **框架**: React 18, Vite
- **样式**: TailwindCSS, CSS Variables（暗黑模式，采用精美轻奢的沙金霓虹配色）
- **动画**: Motion (Framer Motion)
- **图标**: Lucide React

### 后端 (Backend)
- **服务器**: Node.js + Express
- **实时同步**: Server-Sent Events (SSE)
- **数据库**: Firebase (Firestore 用于存储用户引导与 Auth/元数据信息)，本地扁平化 `db.json` 文件用于存储情侣之间的共享数据。

### 安全与加密 (Security & Encryption)
- **密码学**: Web Crypto API (PBKDF2, AES-GCM-256)
- **PIN 码验证**: Bcrypt（服务端进行哈希哈希验证）
- **数据校验**: Zod Schema validation
- **并发控制**: 内存互斥锁 (`async-mutex`)
- **防重放与 CSRF 攻击**: Nonce + 时间戳 + CSRF 令牌
- **安全响应头**: Helmet CSP (内容安全策略)

---

## 🔐 安全架构与端到端加密 (E2EE)

应用严格遵循零知识 (Zero-Knowledge) 安全模型：
- **密钥衍生 (Key Derivation)**: 对称加密密钥完全在客户端 (Client-side) 生成。通过 **PBKDF2** 算法（100,000 次迭代）将配对邀请码 (`pairingCode`) 和安全盐结合衍生。该密钥仅存在于设备的内存 (RAM) 中，绝不会被发送至服务端。
- **加密 (Encryption)**: 所有的聊天消息、照片瞬间 (Locket) 以及配文在上传到服务器前，均在本地使用 **AES-GCM-256** 算法进行加密。
- **伴侣隔离 (Partner Isolation)**: 两位用户通过一个共享空间相连，但彼此保持独立运行。PIN 锁密保 (`passcode`) 会在服务端使用 `bcrypt` 存储，并通过安全端点间接校验，防止密钥泄露。
- **安全防护 (Threat Mitigation)**:
  - **XSS**: React 自动对输入文本进行转义；对敏感数据进行严格的格式化和输入校验。
  - **路径穿越 (Path Traversal)**: 系统对读取本地 `db.json` 配置了不可变的绝对路径。
  - **原型链污染 (Prototype Pollution)**: Zod Schema 会自动过滤并丢弃所有不符合输入定义的冗余字段。

---

## ✨ 特色功能

### 1. 甜蜜私聊 (Secret Chat)
- 支持文字聊天和语音消息 (Voice Messages)，全部经过 E2EE 端到端加密。
- 拥有“阅后即焚”(View Once) 模式，查看后将从服务器中自动永久销毁。
- 直观的密码学检查器 (Crypto Inspector) 允许在 UI 上直接查看明文 (Plaintext)、密文 (Ciphertext) 以及十六进制的 AES-GCM 密钥。

### 2. 补水站 (Hydration Hub)
- 记录与追踪两人当天的共同饮水目标和进度。
- 快速录入 5 档预设水量：`250ml`, `350ml`, `500ml`, `750ml`, `1L`。
- **拍照验证**: 记录饮水量时，用户可选择开启前置/后置摄像头进行拍照验证，照片自动通过 E2EE 加密后发送至 Locket 照片墙。

### 3. Locket 瞬间 (Album)
- 实时同步的照片流网格，记录珍贵瞬间。
- 支持将加密的照片数据备份 (Backup) 至每个伴侣个人的 Google Drive，而无需占用共享服务器的资源。

### 4. 约会计划与纪念日
- 待办事项管理 (TodoList)，按截止时间智能排序。
- 记录在一起的天数，并附带特别纪念碑里程碑列表。
- **Gemini AI 顾问**: 根据你们在一起的天数，智能推荐新颖独特的约会方案。

---

## 🚀 本地运行与安装指南

# 🎥 演示视频
[![Duo Couple App Demo](https://github.com/user-attachments/assets/c30da2d6-15de-420f-bd6c-3fcb6f2c3493)](https://youtu.be/njZ_hRffWyM)

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
复制模板文件创建 `.env` 文件：
```bash
cp .env.example .env
```
打开新建的 `.env` 文件并填入相应的 API 密钥与配置：
```env
PORT=3000
NODE_ENV=development
GEMINI_API_KEY=your_gemini_api_key

# Firebase 客户端配置 (用于 Onboarding / Auth)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. 运行开发模式 (Development)
```bash
npm run dev
```
打开浏览器访问：`http://localhost:3000`

### 4. 生产打包
编译并打包应用程序以用于生产部署：
```bash
npm run build
```

### 5. 启动生产版本
```bash
npm run start
```

---

## 📦 主要目录结构
- `server.ts`: Node.js Express 后端入口文件，包含所有的 API 路由和 SSE 事件总线。
- `src/App.tsx`: 主应用入口组件，负责状态控制和 SSE 连接监听。
- `src/components/`: 功能性 Tab 面板组件（如 `ChatTab.tsx`, `AlbumTab.tsx`, `SecurityHub.tsx` 等）。
- `src/lib/`:
  - `crypto.ts`: 对称加解密核心算法、PBKDF2 密钥生成函数。
  - `apiClient.ts`: 统一的 HTTP API 客户端封装。
  - `storage.ts`: 集中化的浏览器 `localStorage` 缓存管理。
- `db.json`: 模拟本地扁平化数据库的 JSON 文件。

---

## 📄 版权与贡献声明
该项目由 **MaxxAlan** 开发。如有任何反馈、建议或发现 Bug，请在仓库中提交 Issue。
