# Duo — Couple App (E2EE) 🔒❤️

Ứng dụng web bảo mật mã hóa đầu cuối (E2EE) dành cho các cặp đôi để chia sẻ tin nhắn, hình ảnh khoảnh khắc (Locket), theo dõi sức khỏe (uống nước), quản lý kế hoạch chung và gợi ý hẹn hò thông qua trí tuệ nhân tạo Gemini AI.

Dự án được tối ưu hóa cho cả thiết bị di động (Mobile Web) và máy tính (Desktop) với giao diện tinh tế, sang trọng, cùng cơ chế đồng bộ hóa thời gian thực (realtime) mạnh mẽ.

---

## 🛠️ Công Nghệ Sử Dụng

### Frontend
- **Framework**: React 18, Vite
- **Styling**: TailwindCSS, CSS Variables (Chủ đề tối, màu neon vàng cát sang trọng)
- **Animations**: Motion (Framer Motion)
- **Icons**: Lucide React

### Backend
- **Server**: Node.js + Express
- **Realtime**: Server-Sent Events (SSE)
- **Database**: Firebase (Firestore cho thông tin người dùng và couple metadata), Tệp JSON phẳng `db.json` trên cục bộ cho dữ liệu chia sẻ của cặp đôi.

### Bảo mật & Mã hóa
- **Mật mã học**: Web Crypto API (PBKDF2, AES-GCM-256)
- **Xác thực PIN**: Bcrypt (Hash phía server)
- **Kiểm tra dữ liệu**: Zod Schema validation
- **An toàn luồng**: Memory Mutex (`async-mutex`)
- **Tấn công Replay & CSRF**: Nonce + Timestamp + Token CSRF
- **Headers bảo mật**: Helmet CSP (Content Security Policy)

---

## 🔐 Kiến Trúc Bảo Mật & E2EE

Ứng dụng tuân thủ nghiêm ngặt mô hình bảo mật Zero-Knowledge:
- **Tạo khóa (Key Derivation)**: Khóa đối xứng được sinh ra hoàn toàn ở phía máy khách (Client-side) thông qua thuật toán **PBKDF2** (100,000 vòng lặp) từ mã mời liên kết (`pairingCode`) và muối bảo mật. Khóa này chỉ nằm trong bộ nhớ RAM của thiết bị và không bao giờ được gửi lên Server.
- **Mã hóa (Encryption)**: Tất cả tin nhắn chat, ảnh khoảnh khắc (Locket) và captions đều được mã hóa bằng thuật toán **AES-GCM-256** trước khi tải lên máy chủ.
- **Cách ly Người dùng (Isolation)**: Hai người dùng kết nối qua một không gian chung nhưng hoạt động độc lập. Việc cài đặt mật mã khóa PIN (`passcode`) được băm bằng `bcrypt` ở phía server và xác thực gián tiếp qua endpoint bảo mật để tránh lộ khóa.
- **An toàn trước các mối đe dọa (Threat Mitigation)**:
  - **XSS**: React tự động escape text; các dữ liệu nhạy cảm được validate đầu vào nghiêm ngặt.
  - **Path Traversal**: Hệ thống đọc tệp tĩnh `db.json` được định cấu hình đường dẫn tuyệt đối bất biến.
  - **Prototype Pollution**: Zod Schema loại bỏ toàn bộ các trường dư thừa không khớp định nghĩa đầu vào.

---

## ✨ Tính Năng Nổi Bật

### 1. Trò chuyện mật ngọt (Secret Chat)
- Tin nhắn dạng chữ hoặc tin nhắn thoại (Voice Messages) được mã hóa E2EE hoàn toàn.
- Hỗ trợ chế độ "Xem một lần" (View Once) tự động hủy vĩnh viễn trên server sau khi xem.
- Bộ phân tích mật mã (Crypto Inspector) trực quan cho phép xem bản rõ (Plaintext) và bản mã (Ciphertext) kèm khóa AES-GCM dạng Hex ngay trên UI.

### 2. Trạm Cấp Nước (Hydration Hub)
- Theo dõi tiến trình uống nước chung của hai người trong ngày.
- Bổ sung nhanh dung tích nước với 5 mức: `250ml`, `350ml`, `500ml`, `750ml`, `1L`.
- **Chụp ảnh xác minh**: Khi ghi nhận lượng nước uống, người dùng có thể chọn mở camera phụ, chụp ảnh xác minh và tự động gửi ảnh đã mã hóa E2EE lên lưới Locket.

### 3. Khoảnh khắc Locket (Album)
- Lưới ảnh thời gian thực lưu trữ các kỉ niệm đáng nhớ.
- Hỗ trợ sao lưu dự phòng (Backup) dữ liệu ảnh mã hóa trực tiếp lên Google Drive cá nhân của từng partner thay vì lưu trữ trên server chung.

### 4. Kế hoạch hẹn hò & Kỷ niệm
- Quản lý danh sách việc cần làm (TodoList) sắp xếp theo thời gian đến hạn.
- Đếm số ngày bên nhau với danh sách các cột mốc kỷ niệm đặc biệt.
- **Cố vấn Gemini AI**: Đề xuất các ý tưởng hẹn hò độc đáo dựa trên số ngày bên nhau của hai bạn.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Cục Bộ (Local)

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Cấu hình biến môi trường
Sao chép tệp mẫu để tạo tệp `.env`:
```bash
cp .env.example .env
```
Mở file `.env` mới tạo và cấu hình các khóa cần thiết:
```env
PORT=3000
NODE_ENV=development
GEMINI_API_KEY=your_gemini_api_key

# Cấu hình Firebase Client (Dùng cho Onboarding / Auth)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Chạy chế độ phát triển (Development)
```bash
npm run dev
```
Truy cập ứng dụng tại địa chỉ: `http://localhost:3000`

### 4. Build đóng gói
Để biên dịch và đóng gói ứng dụng cho production:
```bash
npm run build
```

### 5. Chạy bản build Production
```bash
npm run start
```

---

## 📦 Cấu trúc Thư mục Chính
- `server.ts`: Điểm khởi chạy của backend Express, các API endpoints và luồng sự kiện SSE.
- `src/App.tsx`: Trình điều khiển ứng dụng chính, quản lý state và luồng sự kiện SSE.
- `src/components/`: Chứa các tab tính năng (`ChatTab.tsx`, `AlbumTab.tsx`, `SecurityHub.tsx`,...).
- `src/lib/`:
  - `crypto.ts`: Hàm mã hóa/giải mã đối xứng, tạo khóa PBKDF2.
  - `apiClient.ts`: Lớp kết nối HTTP API dùng chung.
  - `storage.ts`: Quản lý truy cập `localStorage` tập trung.
- `db.json`: Cơ sở dữ liệu tệp phẳng cục bộ mô phỏng.

---

## 📄 Bản Quyền & Phát Triển
Ứng dụng được phát triển bởi **MaxxAlan**. Mọi đóng góp hoặc báo cáo lỗi xin vui lòng liên hệ qua kho lưu trữ dự án.
