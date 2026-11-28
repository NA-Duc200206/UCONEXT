# Hướng Dẫn Deploy Demo Miễn Phí (0 VNĐ — Không Cần Thẻ)

Hướng dẫn từng bước đưa toàn bộ **UCONEXT** (React SPA + Express/TypeScript API + Socket.IO + Swagger `/api/docs` + Google Sign-In + AI Shopping Assistant) lên link `https://<ten-app>.onrender.com` có sẵn HTTPS hoàn toàn miễn phí.

## Tổng Quan Stack Miễn Phí

| Thành phần | Dịch vụ miễn phí | Gói Free cung cấp | Bắt buộc? |
| --- | --- | --- | --- |
| Hosting (SPA + API + Socket.IO) | [Render Web Service](https://render.com) | Free (`*.onrender.com` HTTPS, tự ngủ sau 15 phút nghỉ) | Có |
| Database | [MongoDB Atlas M0](https://www.mongodb.com/atlas) | 512 MB miễn phí trọn đời | Có |
| Email (SMTP) | Gmail App Password hoặc [Brevo](https://www.brevo.com) | Miễn phí (300 mail/ngày với Brevo) | Có |
| Cache & Distributed Locks | [Upstash Redis](https://upstash.com) | 10.000 lệnh/ngày miễn phí *(tự fallback nếu bỏ trống)* | Khuyên dùng |
| Giám sát lỗi (Error Tracking) | [Sentry](https://sentry.io) | 5.000 lỗi/tháng miễn phí | Khuyên dùng |
| Giữ server luôn thức | [UptimeRobot](https://uptimerobot.com) | Ping mỗi 5–10 phút miễn phí | Khuyên dùng |
| AI Shopping Assistant | [Google AI Studio (Gemini)](https://aistudio.google.com) hoặc [OpenRouter](https://openrouter.ai) | Có tier miễn phí | Tùy chọn |

Nhờ `Dockerfile.render` đóng gói luôn `frontend/dist` vào Express (`SERVE_FRONTEND_DIST=true`), toàn bộ giao diện, `/api/*`, `/api/docs`, `/uploads/*` và `/socket.io` chạy chung **1 tên miền duy nhất** — không lỗi CORS, cookie `HttpOnly` hoạt động ổn định và tự động nhận `RENDER_EXTERNAL_URL`.

---

## Bước 1: Tạo Database MongoDB Atlas M0 (Miễn Phí)

1. Đăng nhập [MongoDB Atlas](https://www.mongodb.com/atlas) -> tạo Cluster gói **M0 Free** (chọn vùng **Singapore**).
2. Vào **Database Access** -> tạo user (chỉ dùng chữ + số cho mật khẩu để tránh lỗi URL).
3. Vào **Network Access** -> **Add IP Address** -> chọn **Allow Access from Anywhere (`0.0.0.0/0`)** -> **Confirm**.
4. Vào **Database -> Connect -> Drivers** -> copy chuỗi `MONGODB_URI` (thêm tên DB `/uconext` trước dấu `?`):
   ```text
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/uconext?retryWrites=true&w=majority
   ```

---

## Bước 2: Lấy Mật Khẩu Gửi Mail (Gmail App Password)

1. Bật **Xác minh 2 bước** tại [myaccount.google.com/security](https://myaccount.google.com/security).
2. Vào [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) -> đặt tên `UCONEXT` -> bấm **Tạo** -> copy **16 ký tự** (bỏ dấu cách).
3. Bạn sẽ có 4 biến cho Render:
   - `SMTP_HOST` = `smtp.gmail.com`
   - `SMTP_PORT` = `587`
   - `SMTP_USER` = `<email>@gmail.com`
   - `SMTP_PASS` = `<16 ký tự App Password>`
   - `SMTP_FROM` = `UCONEXT <<email>@gmail.com>`

---

## Bước 3: Deploy 1-Click Trên Render

1. Đăng nhập [dashboard.render.com](https://dashboard.render.com) bằng GitHub.
2. Bấm **New + -> Blueprint** -> chọn repo này (Render tự đọc `render.yaml` và `Dockerfile.render`).
3. Điền các biến bắt buộc (`MONGODB_URI`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
   - `JWT_SECRET` và `JWT_REFRESH_SECRET` được Render tự sinh ngẫu nhiên an toàn.
   - `RENDER_EXTERNAL_URL` được Render tự gắn vào CORS whitelist.
4. Bấm **Apply** -> chờ ~3–5 phút tới khi hiện **Live** xanh.
   - Storefront: `https://<ten-app>.onrender.com`
   - Swagger API Docs: `https://<ten-app>.onrender.com/api/docs`
   - Health check: `https://<ten-app>.onrender.com/api/health`

### Nếu muốn bật Google Sign-In & AI Chat trên Render:
- **Google Sign-In (Firebase):**
  1. Thêm 5 biến vào **Render -> Environment**: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`.
  2. Vào **Firebase Console -> Authentication -> Settings -> Authorized domains -> Add domain** -> thêm `<ten-app>.onrender.com` (không có `https://`).
- **AI Chat (Gemini):**
  - Thêm 3 biến vào **Render -> Environment**: `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL`.

---

## Bước 4: Nạp Dữ Liệu Mẫu (Chỉ Làm 1 Lần Nếu DB Còn Trống)

### Cách 1 — Bật tạm trên Render (không cần gõ lệnh)
1. Vào **Render -> Environment -> Edit**, đặt tạm 4 biến:
   - `SEED_ADMIN_EMAIL`: email admin của bạn
   - `SEED_ADMIN_PASSWORD`: mật khẩu mạnh (tối thiểu 12 ký tự)
   - `AUTO_SEED=true`
   - `ALLOW_PROD_SEED=true`
2. Bấm **Save, rebuild, and deploy** -> chờ thấy web hiện đầy đủ sản phẩm.
3. Đổi `AUTO_SEED` và `ALLOW_PROD_SEED` về lại `false` rồi lưu.

### Cách 2 — Chạy CLI 1 lần từ máy cá nhân
```bash
NODE_ENV=production \
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/uconext?retryWrites=true&w=majority" \
SEED_ADMIN_EMAIL="admin@example.com" \
SEED_ADMIN_PASSWORD="ChangeMeStrong123!" \
npm run build:backend && npm run seed --workspace=backend
```

---

## Bước 5 (Khuyên Dùng): Bật Redis + Sentry + Chống Ngủ (0 VNĐ, Không Cần Thẻ)

### 1. Upstash Redis Free (tăng tốc tải sản phẩm & cache gợi ý)
1. Đăng nhập [console.upstash.com](https://console.upstash.com) bằng GitHub/Google -> bấm **Create Database** (chọn vùng **Singapore**, gói Free).
2. Ở mục **Connect**, copy chuỗi **`rediss://default:...@...upstash.io:6379`**.
3. Dán vào biến **`REDIS_URL`** trong **Render -> Environment** -> lưu lại.

### 2. Sentry Free (tự động báo lỗi runtime cả Backend lẫn Frontend)
1. Đăng nhập [sentry.io](https://sentry.io) -> tạo 1 project **Node.js** (lấy `SENTRY_DSN`) và 1 project **React** (lấy `VITE_SENTRY_DSN`).
2. Dán 2 biến `SENTRY_DSN` và `VITE_SENTRY_DSN` vào **Render -> Environment** -> bấm **Save, rebuild, and deploy**.

### 3. UptimeRobot Free (giữ web Render Free luôn thức khi đi demo / nộp CV)
1. Đăng nhập [uptimerobot.com](https://uptimerobot.com) -> bấm **Add New Monitor**.
2. Chọn Type: **HTTP(s)**, URL: `https://<ten-app>.onrender.com/api/health`, Monitoring Interval: **10 minutes** -> **Create Monitor**.

---

## Lưu Ý Nhỏ Khi Demo Miễn Phí
- **Ổ đĩa tạm trên Render Free:** Ảnh sản phẩm mẫu dùng link Unsplash nên luôn giữ nguyên sau khi deploy; riêng avatar/ảnh upload cục bộ vào `/uploads` sẽ reset khi redeploy trừ khi cấu hình thêm S3/R2 (`S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`).
- **GitHub Actions CD:** Khi không cấu hình secret VPS (`DEPLOY_SSH_*`), workflow `.github/workflows/deploy.yml` vẫn tự build & đẩy Docker image lên GHCR và bỏ qua bước SSH VPS sạch sẽ với thông báo `::notice::`.
