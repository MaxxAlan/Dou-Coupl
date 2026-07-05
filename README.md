# PROMPT: Hoàn thiện "Duo — Couple App (E2EE)" để sẵn sàng test production

> **Cách dùng file này:** Copy toàn bộ nội dung bên dưới (từ mục 1 trở đi) và đưa cho Claude
> (khuyến nghị dùng Claude Code, vì cần đọc/sửa nhiều file + chạy lệnh) làm system/user prompt
> cho một phiên làm việc mới trên chính repo này.

---

## 1. Vai trò & bối cảnh

Bạn là senior full-stack engineer, được giao review & hoàn thiện một ứng dụng React + Express
có tên **"Duo — Couple App"**: một app mô phỏng 2 điện thoại (Partner A/B) trong 1 trang, có chat,
album ảnh, nhắc nhở, dòng thời gian kỷ niệm, khoá PIN/FaceID, tích hợp Google Drive/Photos, và
gợi ý hẹn hò bằng Gemini AI. App tự nhận là có **mã hoá đầu cuối (E2EE)**.

Repo hiện tại **chạy được ở mức demo** nhưng có bug runtime, lỗ hổng bảo mật nghiêm trọng (đặc biệt
là kiến trúc E2EE bị vô hiệu hoá do rò rỉ khoá qua API), thiếu validate input, thiếu test, và chưa
sẵn sàng cho môi trường production/staging thật.

Nhiệm vụ của bạn: **sửa toàn bộ vấn đề bên dưới**, theo đúng nguyên tắc thực thi ở mục 2, và báo
cáo lại theo định dạng ở mục 5.

---

## 2. Nguyên tắc bắt buộc khi thực thi

1. **Chia nhỏ công việc**: mỗi task trong mục 3 phải được làm như một đơn vị độc lập, có thể
   commit/PR riêng, có thể test riêng mà không phụ thuộc các task chưa xong.
2. **Hàm nhỏ, một trách nhiệm**: khi viết code mới, ưu tiên pure function, input/output rõ ràng,
   dễ unit test độc lập (không phụ thuộc DOM/state ngoài nếu không cần thiết).
3. **Tận dụng tối đa code đã có** — không viết lại logic đã tồn tại:
   - Mọi thao tác mã hoá/giải mã **phải** đi qua `lib/crypto.ts` (không tự chế base64/AES ở nơi khác).
   - Mọi gọi API tới server **phải** đi qua một module `lib/apiClient.ts` dùng chung (tạo mới ở
     Phase 3) thay vì `fetch()` rải rác trong từng component.
   - Truy cập `localStorage` **phải** đi qua 1 hook/service dùng chung (tạo mới ở Phase 3), không
     gọi `localStorage.getItem/setItem` trực tiếp trong JSX của nhiều component như hiện tại
     (đang lặp lại ở `AlbumTab.tsx`, `SecurityHub.tsx`, `App.tsx`, `AnniversaryTab.tsx`).
   - Logic "decrypt toàn bộ danh sách" đang bị copy-paste giữa `ChatTab.tsx` và `AlbumTab.tsx`
     → gộp thành 1 hook dùng chung, ví dụ `useDecryptedCollection()`.
4. **Không phá vỡ tính năng demo đang chạy tốt** (split-screen 2 điện thoại, SSE realtime, seed
   data mẫu) trừ khi task yêu cầu thay đổi hành vi rõ ràng.
5. **Giữ nguyên ngôn ngữ tiếng Việt trong UI** — chỉ sửa nội dung UI khi task yêu cầu.
6. **Không hardcode secrets mới** — mọi key/secret phải qua biến môi trường (`.env`), có
   `.env.example` đi kèm.
7. **Mỗi task phải có cách kiểm chứng độc lập** (unit test, curl command, hoặc bước thao tác tay
   rõ ràng) — không được báo "done" nếu chưa verify được.

---

## 3. Kế hoạch công việc (thực hiện theo đúng thứ tự Phase)

### PHASE 0 — Audit & chuẩn bị môi trường

- [ ] **P0-1**: Cài `zod` (validate schema), `express-rate-limit`, `helmet`, `async-mutex` (khoá
  ghi file), `vitest` + `supertest` (test). Cập nhật `package.json`.
- [ ] **P0-2**: Tạo `.env.example` liệt kê toàn bộ biến môi trường cần thiết (`GEMINI_API_KEY`,
  `PORT`, `NODE_ENV`, các biến Firebase nếu chuyển sang env — xem SEC-9).
- [ ] **P0-3**: Xác nhận `npm run lint` (tsc --noEmit) chạy sạch trước khi bắt đầu, ghi lại baseline
  lỗi hiện có (nếu có) để không lẫn với lỗi mới phát sinh.

---

### PHASE 1 — Sửa bug chức năng nghiêm trọng (BLOCKER, làm trước tiên)

- [ ] **BUG-1 (Critical — crash)**: Trong `AlbumTab.tsx`, phần "Live Decryption Feedback Panel",
  sửa `activePhotoView.encryptedCaption.substring(0, 16)` → dùng đúng field theo `types.ts`
  (`activePhotoView.captionCiphertext`), có optional-chaining/fallback vì field có thể `undefined`.
  **DoD**: mở một ảnh có caption trong Album không còn throw lỗi console/crash UI.

- [ ] **BUG-2**: Trong `SecurityHub.tsx` (mục "Đồng bộ Google Drive"), bỏ email hardcode
  `manhhoangvipbao@gmail.com`, thay bằng `googleUser?.email` thật (lấy từ Firebase Auth state),
  hoặc ẩn dòng đó nếu chưa đăng nhập Google.
  **DoD**: hiển thị đúng email của tài khoản Google đang đăng nhập, không còn giá trị giả.

- [ ] **BUG-3**: `RemindersTab.tsx` — sắp xếp `filteredReminders` theo `dueDate` tăng dần trước khi
  render (hiện đang giữ nguyên thứ tự thêm vào, gây khó theo dõi).
  **DoD**: reminder gần hạn nhất luôn hiển thị trên cùng.

- [ ] **BUG-4**: `App.tsx` — tránh derive `symmetricKey` 2 lần khi mount (1 lần từ giá trị mặc định
  `'DUO-2026-LOVE'` trước khi `loadDatabase()` trả về `pairingCode` thật, 1 lần sau đó). Chỉ derive
  key sau khi đã có `pairingCode` thật từ server (hoặc show loading state cho đến lúc đó).
  **DoD**: chỉ 1 lần gọi `deriveSymmetricKey` mỗi lần pairingCode thay đổi thực sự; không có
  "flash" nội dung giải mã sai trong 1 khung hình đầu.

- [ ] **BUG-5**: Quyết định số phận field `expiresAt` trong `EncryptedMessage` (types.ts) — hiện
  khai báo nhưng không dùng ở đâu. Hoặc (a) implement tính năng "tin nhắn tự huỷ" tối giản, hoặc
  (b) xoá field khỏi type kèm comment giải thích để tránh gây hiểu nhầm cho dev sau. Ghi rõ lựa
  chọn trong báo cáo cuối.

- [ ] **BUG-6**: SSE reconnect — thêm handler `eventSource.onopen` trong `App.tsx`: mỗi khi kết nối
  SSE được (tái) thiết lập, gọi lại `loadDatabase()` để đồng bộ lại state đầy đủ, tránh mất dữ liệu
  khi có khoảng downtime giữa lúc mất kết nối và lúc reconnect.
  **DoD**: tắt mạng giả lập (dev tools offline) 5 giây rồi bật lại → state đồng bộ đầy đủ, không
  thiếu tin nhắn được gửi trong lúc offline.

---

### PHASE 2 — Bảo mật (ưu tiên cao nhất về mặt rủi ro, đọc kỹ trước khi sửa)

> Đây là phần quan trọng nhất theo yêu cầu "kiểm tra injection để tránh leak dữ liệu". Vì backend
> dùng file JSON phẳng (không có SQL/NoSQL DB thật), **SQL injection kinh điển không áp dụng**,
> nhưng có nhiều lớp rủi ro tương đương cần xử lý — liệt kê rõ bên dưới.

- [ ] **SEC-1 (Critical — kiến trúc E2EE bị vô hiệu hoá)**:
  `pairingCode` là nguyên liệu tạo khoá AES (`deriveSymmetricKey`) nhưng lại được server lưu và
  trả về nguyên văn qua `GET /api/state` không cần xác thực → bất kỳ ai gọi API cũng derive được
  khoá và đọc được toàn bộ tin nhắn/ảnh "đã mã hoá". Chọn **1 trong 2 hướng** và ghi rõ lựa chọn
  trong báo cáo:
  - **(a) Fix nhanh cho bản demo/staging** (khuyến nghị làm trước): không trả `pairingCode` qua
    `/api/state` nữa (chỉ dùng nội bộ server để không đổi hành vi khác); yêu cầu client gửi kèm
    `pairingCode` trong header khi cần xác thực thao tác (tối thiểu hoá bề mặt lộ khoá qua API
    đọc chung); đồng thời cập nhật UI (SecurityHub) ghi rõ ràng "Đây là mô phỏng E2EE cho mục
    đích demo, chưa chống được server/admin đọc dữ liệu" để không quảng cáo sai bảo mật thật.
  - **(b) Fix đúng kiến trúc** (đánh dấu là stretch goal, có thể làm ở PR riêng sau): pairingCode
    chỉ dùng làm "room ID" công khai để 2 client tìm nhau; khoá đối xứng thật được trao đổi qua
    ECDH (`crypto.subtle.generateKey('ECDH', ...)`) trực tiếp giữa 2 client qua kênh server chỉ
    relay ciphertext của bước handshake, server không bao giờ biết được khoá cuối cùng.
  **DoD**: viết rõ trong README phần "Bảo mật" mô tả đúng mức độ E2EE thực tế sau khi fix.

- [ ] **SEC-2 (Critical — PIN lộ dạng plaintext)**: `passcodeHash` hiện là PIN 4 số **dạng thô**,
  không hash, và được server trả nguyên văn qua `/api/state` để client tự so sánh. Sửa:
  - Server hash PIN bằng `bcrypt`/`argon2` trước khi lưu vào `db.json`.
  - Thêm endpoint `POST /api/passcode/verify` nhận PIN thô, so sánh hash **ở server**, trả về
    `{ valid: boolean }` — không bao giờ trả hash về client.
  - Sửa `App.tsx`/`PasscodeLock.tsx` để gọi endpoint verify thay vì so sánh string ở client.
  **DoD**: `db.json` không còn chứa PIN dạng đọc được; `/api/state` không trả field passcode nào
  có thể dùng để mở khoá trực tiếp.

- [ ] **SEC-3 (Critical — không có auth, ai cũng ghi/xoá được dữ liệu)**: Thêm cơ chế xác thực tối
  thiểu cho các endpoint ghi/xoá (`POST/DELETE`), đặc biệt `/api/reset` (xoá toàn bộ DB) và
  `/api/pair-code`. Tối thiểu: yêu cầu client gửi `pairingCode` hợp lệ trong header
  (`X-Pairing-Code`) khớp với DB hiện tại trước khi cho phép ghi; hoặc implement session token đơn
  giản cấp sau khi hoàn tất onboarding. Ghi rõ giới hạn của giải pháp chọn trong báo cáo.
  **DoD**: gọi `POST /api/reset` không có header hợp lệ → trả `401`, không xoá dữ liệu.

- [ ] **SEC-4 (High — server làm proxy Gemini miễn phí/vô danh)**: Endpoint `/api/ai-ideas` nhận
  `customApiKey` tuỳ ý từ client và gọi Gemini hộ. Sửa:
  - Thêm rate limit riêng cho endpoint này (ví dụ 5 request/phút/IP).
  - Nếu `customApiKey` không được cung cấp, dùng key server nhưng giới hạn số lần gọi/ngày.
  - Log (không log giá trị key) mọi lần endpoint được gọi để phát hiện lạm dụng.
  **DoD**: spam gọi endpoint > giới hạn → trả `429`.

- [ ] **SEC-5 (High — thiếu validate input trên mọi POST endpoint)**: Dùng `zod` định nghĩa schema
  cho **từng** body của **từng** endpoint trong `server.ts` (`/api/messages`, `/api/photos`,
  `/api/reminders`, `/api/anniversary`, `/api/passcode`, `/api/special-anniversaries`,
  `/api/profile`, `/api/storage-method`, `/api/pair-code`). Validate:
  - Kiểu dữ liệu đúng, độ dài string tối đa hợp lý (chặn payload khổng lồ gây DoS).
  - `category` của reminder phải thuộc enum `['date','gift','daily','special']`.
  - `dueDate`/`anniversaryDate` đúng format `YYYY-MM-DD`.
  - `avatar`/`photo` (data URI) giới hạn kích thước tối đa (ví dụ 3MB sau decode base64).
  Trả lỗi `400` rõ ràng khi validate fail, không để lỗi crash server.
  **DoD**: gửi payload sai type/thiếu field/quá lớn → nhận `400` với message rõ ràng, server
  không crash, `db.json` không bị ghi dữ liệu rác.

- [ ] **SEC-6 (High — rate limiting toàn cục thiếu)**: Áp `express-rate-limit` cho toàn bộ
  `/api/*` (ví dụ 100 request/phút/IP), riêng các endpoint ghi nhạy cảm (passcode, reset,
  pair-code) giới hạn chặt hơn (5-10 request/phút).
  **DoD**: test bằng script gửi > limit request liên tiếp → nhận `429` đúng ngưỡng.

- [ ] **SEC-7 (Medium — thiếu security headers)**: Thêm `helmet()` vào `server.ts`; cấu hình CSP
  hợp lý cho phép Google Fonts, Firebase, Google APIs; set `X-Content-Type-Options`,
  `X-Frame-Options` (cân nhắc vì app chạy trong iframe của AI Studio — nếu cần iframe, dùng
  `frameguard: false` có kiểm soát thay vì tắt hoàn toàn mọi bảo vệ).
  **DoD**: response header của mọi route có đầy đủ header bảo mật cơ bản (kiểm bằng
  `curl -I`).

- [ ] **SEC-8 (Medium — CORS không nhất quán)**: Hiện chỉ route SSE set
  `Access-Control-Allow-Origin: '*'`. Thống nhất chính sách CORS cho toàn bộ app (nếu chỉ phục vụ
  same-origin thì bỏ header `*` này; nếu cần cross-origin, dùng whitelist domain cụ thể qua biến
  môi trường thay vì wildcard).
  **DoD**: không còn `Access-Control-Allow-Origin: *` không chủ đích nào sót lại trong code.

- [ ] **SEC-9 (Medium — quản lý secret)**: Chuyển `firebase-applet-config.json` sang đọc từ biến
  môi trường tại build time (Vite `import.meta.env`), không commit giá trị thật vào repo (dùng
  file mẫu `.env.example` + hướng dẫn trong README). Xác nhận trong Firebase Console: Authorized
  domains được giới hạn đúng domain deploy, cân nhắc bật Firebase App Check để giảm rủi ro lạm
  dụng API key lộ ra ngoài (API key web của Firebase không phải bí mật tuyệt đối, nhưng vẫn nên
  giới hạn domain).
  **DoD**: `git grep` không còn tìm thấy giá trị secret cứng nào ngoài file `.env.example` (chứa
  placeholder).

- [ ] **SEC-10 (Low/Info — rà soát injection theo từng lớp, ghi vào báo cáo)**: Xác nhận và ghi
  chú kết quả rà soát cho từng loại injection sau (đa số đã an toàn nhờ React auto-escape + không
  dùng `dangerouslySetInnerHTML`/không có SQL, nhưng phải verify lại sau khi sửa SEC-5):
  - XSS lưu trữ qua `avatar`/`photo`/`notes`/`title` (render qua `<img src>` / text node — React
    tự escape text, ảnh qua `<img>` không thực thi script ngay cả với SVG data URI) → xác nhận
    **không** có chỗ nào dùng `dangerouslySetInnerHTML` trong toàn repo.
  - Prompt injection vào Gemini qua `anniversaryDate`: validate format ngày ở SEC-5 giúp loại bỏ
    khả năng chèn chuỗi lệnh lạ vào prompt.
  - Path traversal: `DB_FILE` là path cố định, không nhận input từ client → an toàn, xác nhận
    không có endpoint nào build file path từ input người dùng.
  - Prototype pollution: các đoạn `state.partnerA = { ...state.partnerA, name, avatar }` chỉ merge
    field cụ thể (không spread toàn bộ `req.body`) → an toàn, nhưng thêm `zod` (SEC-5) để chặn
    thêm field lạ ngay từ đầu.
  **DoD**: một đoạn trong README/SECURITY.md liệt kê kết quả rà soát này.

---

### PHASE 3 — Toàn vẹn dữ liệu & tái cấu trúc để tái sử dụng code

- [ ] **DATA-1 (High — race condition ghi file)**: Bọc `readDatabase()`/`writeDatabase()` bằng
  `async-mutex` (hoặc hàng đợi ghi tuần tự) để tránh mất dữ liệu khi 2 request ghi gần như đồng
  thời (ví dụ A gửi tin nhắn và B thêm reminder cùng lúc).
  **DoD**: test gửi 20 request ghi đồng thời (Promise.all) → không có request nào bị mất dữ liệu
  của request khác (viết integration test kiểm tra độ dài mảng cuối cùng = số request).

- [ ] **DATA-2 (Medium — giới hạn kích thước & nén ảnh)**: Trước khi mã hoá & upload ảnh
  (`AlbumTab.tsx`, `AnniversaryTab.tsx`, `SecurityHub.tsx` avatar), thêm bước resize/nén ảnh phía
  client (canvas resize xuống max cạnh ví dụ 1600px, chất lượng JPEG ~0.8) trước khi convert base64,
  và hiển thị lỗi rõ ràng nếu người dùng chọn file quá lớn (ví dụ > 8MB gốc) thay vì âm thầm gửi
  lên server rồi bị `express.json` limit chặn không rõ lý do.
  **DoD**: chọn ảnh 10MB → được resize/nén tự động hoặc báo lỗi rõ ràng cho người dùng, không bị
  lỗi mạng khó hiểu.

- [ ] **REFACTOR-1**: Tạo `src/lib/apiClient.ts` — module duy nhất chứa toàn bộ hàm gọi API
  (`postMessage`, `uploadPhoto`, `deletePhoto`, `addReminder`, ...), có xử lý lỗi tập trung
  (try/catch + optional callback báo lỗi lên UI thay vì chỉ `console.error`). Refactor `App.tsx`
  để dùng module này thay vì viết `fetch()` trực tiếp trong từng handler.
  **DoD**: `App.tsx` không còn lời gọi `fetch(` trực tiếp nào, toàn bộ đi qua `apiClient.ts`.

- [ ] **REFACTOR-2**: Tạo `src/hooks/useLocalStorageValue.ts` (hoặc `src/lib/storage.ts`) làm
  điểm truy cập `localStorage` duy nhất, có type-safe get/set/remove. Thay toàn bộ
  `localStorage.getItem/setItem` rải rác trong `AlbumTab.tsx`, `SecurityHub.tsx`,
  `AnniversaryTab.tsx`, `App.tsx`, `PasscodeLock.tsx` bằng hook/service này.
  **DoD**: `grep -r "localStorage\." src/` chỉ còn match bên trong file storage helper mới.

- [ ] **REFACTOR-3**: Tạo hook `useDecryptedCollection(items, key, getCipherIv)` gộp logic decrypt
  hàng loạt đang bị lặp giữa `ChatTab.tsx` (decrypt messages) và `AlbumTab.tsx` (decrypt photos +
  caption). Refactor 2 file này để dùng chung hook.
  **DoD**: logic vòng lặp giải mã chỉ tồn tại ở 1 nơi duy nhất trong codebase.

- [ ] **REFACTOR-4**: Tạo hook `useKeyHex(symmetricKey)` gộp logic `exportKeyToHex` + `useEffect`
  đang lặp lại ở `ChatTab.tsx`, `AlbumTab.tsx`, `SecurityHub.tsx`.
  **DoD**: 3 file trên chỉ gọi 1 hook chung, không tự viết `useEffect` + `exportKeyToHex` riêng.

---

### PHASE 4 — Testing (bắt buộc, không được bỏ qua)

- [ ] **TEST-1**: Unit test cho `lib/crypto.ts` (encrypt → decrypt round-trip trả về đúng
  plaintext; test riêng nhánh fallback khi không có `window.crypto.subtle`; test
  `utf8ToBase64`/`base64ToUtf8` với chuỗi có ký tự Unicode tiếng Việt/emoji).
- [ ] **TEST-2**: Integration test (supertest) cho từng endpoint `server.ts` sau khi thêm zod
  validate (SEC-5): test case hợp lệ trả `200`, test case thiếu field/sai type trả `400`.
- [ ] **TEST-3**: Test riêng cho DATA-1 (race condition) — mô phỏng ghi đồng thời, xác nhận không
  mất dữ liệu.
- [ ] **TEST-4**: Test riêng cho SEC-2 (verify PIN) — PIN đúng trả `valid: true`, PIN sai trả
  `valid: false`, không bao giờ trả hash gốc trong response.
- [ ] **TEST-5**: Test riêng cho SEC-6 (rate limit) — vượt ngưỡng trả `429`.
- [ ] **TEST-6 (smoke test thủ công, ghi lại các bước)**: chạy full flow tay: onboarding A → onboarding
  B (pairing code trùng) → gửi tin nhắn 2 chiều → upload ảnh view-once → thêm reminder → thêm kỷ
  niệm đặc biệt → bật khoá PIN → khoá/mở lại → reset dữ liệu sạch. Ghi lại kết quả pass/fail từng
  bước.

**DoD chung Phase 4**: `npm run test` chạy xanh toàn bộ; smoke test tay pass hết các bước ở TEST-6.

---

### PHASE 5 — Sẵn sàng production

- [ ] **PROD-1**: Thêm `GET /health` trả `{ status: 'ok', uptime, timestamp }` để dùng cho load
  balancer/monitoring.
- [ ] **PROD-2**: Thêm error-handling middleware tập trung ở cuối `server.ts` (bắt mọi lỗi chưa
  xử lý, log có timestamp, trả response chuẩn hoá, không leak stack trace ra client khi
  `NODE_ENV=production`).
- [ ] **PROD-3**: Thêm logging có cấu trúc (ví dụ `pino`) thay cho `console.log/error` rải rác,
  log request method/path/status/thời gian xử lý.
- [ ] **PROD-4**: Xử lý graceful shutdown (`SIGTERM`/`SIGINT`) — đóng hết SSE client, flush ghi
  file đang dở trước khi thoát.
- [ ] **PROD-5**: Kiểm tra & hoàn thiện tuyên bố PWA trong `metadata.json`/README — nếu vẫn muốn
  giữ mô tả "Progressive Web App", cần thêm `manifest.json` + service worker cơ bản (cache shell);
  nếu không, sửa mô tả trong `metadata.json`/README cho khớp thực tế (không quảng cáo tính năng
  chưa có).
- [ ] **PROD-6**: Cập nhật `README.md`: hướng dẫn cấu hình `.env`, lệnh chạy dev/build/start, mô
  tả kiến trúc bảo mật thực tế (link tới phần SEC-10), danh sách biến môi trường bắt buộc.

---

### PHASE 6 — QA checklist cuối & nghiệm thu

- [ ] Toàn bộ checkbox Phase 0–5 đã tick.
- [ ] `npm run lint` sạch.
- [ ] `npm run test` xanh.
- [ ] `npm run build` thành công, `npm run start` chạy được bản production build.
- [ ] Không còn secret cứng nào trong repo (`git grep -i "apikey\|secret\|password" -- ':!*.md'`
  review thủ công kết quả).
- [ ] Không còn `console.log` debug thừa (giữ lại log có chủ đích qua logger ở PROD-3).
- [ ] Smoke test tay (TEST-6) pass 100%.
- [ ] README phản ánh đúng trạng thái thật của app (đặc biệt phần bảo mật/E2EE).

---

## 4. Ràng buộc khi thực thi (nhắc lại)

- Làm **từng task một**, không gộp nhiều task không liên quan vào 1 lần sửa.
- Mỗi task xong → chạy được test/verify độc lập trước khi sang task tiếp theo.
- Không tối ưu hoá vượt phạm vi yêu cầu (không đổi UI/UX ngoài phạm vi bug được liệt kê).
- Nếu phát hiện thêm vấn đề ngoài danh sách trong lúc làm, **thêm vào danh sách với ID mới** và
  xử lý ở cuối, không tự ý mở rộng phạm vi giữa chừng.

## 5. Định dạng báo cáo sau mỗi task/PR

Với mỗi task, báo cáo theo format:

```
### [ID task] Tên task
- File đã sửa: ...
- Thay đổi chính: ...
- Cách đã verify: (lệnh test / bước thao tác tay)
- Kết quả verify: PASS / FAIL (+ chi tiết nếu FAIL)
- Rủi ro còn lại / việc cần làm tiếp (nếu có)
```

Sau khi hoàn tất toàn bộ Phase 0–6, tổng hợp 1 bảng tóm tắt toàn bộ task đã làm, task nào còn
pending, và mức độ rủi ro bảo mật còn tồn đọng (nếu chọn hướng SEC-1(a) thay vì SEC-1(b)).

## Hướng dẫn chạy & build

1. Cài dependencies:
   ```bash
   npm install
   ```
2. Tạo file cấu hình môi trường từ mẫu:
   ```bash
   cp .env.example .env
   ```
   rồi điền giá trị cho `GEMINI_API_KEY`, Firebase và các biến cần thiết.
3. Chạy chế độ phát triển:
   ```bash
   npm run dev
   ```
4. Build production:
   ```bash
   npm run build
   ```
5. Chạy server production:
   ```bash
   npm run start
   ```

> Lưu ý: `npm run build` sẽ build frontend bằng Vite và bundle `server.ts` ra `dist/server.cjs`.
