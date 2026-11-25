# UCONEXT Platform (Multi-Product E-Commerce Store)

> Nền tảng thương mại điện tử Full-Stack (E-Commerce) đa danh mục mang thương hiệu **UCONEXT**, tích hợp AI Shopping Concierge, quản trị toàn diện (Admin Portal), thanh toán COD & VNPAY, bộ nhớ đệm Redis, thông báo thời gian thực qua Socket.IO và đóng gói sẵn sàng cho Docker.

---

## Tính Năng Nổi Bật

- **Trải nghiệm khách hàng (Storefront):**
  - Giao diện Dual-Theme (Dark / Light) với 15 danh mục, ~1.000+ sản phẩm mẫu, lọc & phân trang phía server (giá, thương hiệu, danh mục, đánh giá, từ khóa).
  - Giỏ hàng Hybrid đồng bộ mượt mà giữa `localStorage` và MongoDB, kiểm soát giới hạn tồn kho và khôi phục giỏ nếu giao dịch VNPAY thất bại.
  - Đặt hàng & thanh toán COD hoặc VNPAY (xác thực chữ ký `timingSafeEqual`, đối khớp `vnp_Amount`/`vnpayTxnRef`, tự động hủy & hoàn kho đơn VNPAY treo quá 15 phút).
  - Danh sách yêu thích (Wishlist), sản phẩm đã xem gần đây (Recently Viewed), đánh giá có nhãn *Verified Purchase*, quản lý địa chỉ & lịch sử đơn hàng.
  - **AI Shopping Concierge & Review Insights:** hỗ trợ 7 nhà cung cấp LLM (`Gemini`, `OpenAI`, `Groq`, `OpenRouter`, `DeepSeek`, `Ollama`, `OpenAI-compatible`) kèm 7 công cụ truy vấn dữ liệu thật.
- **Cổng quản trị (Admin Portal & RBAC):**
  - Dashboard phân tích doanh thu ròng (loại trừ đơn hủy/hoàn tiền), đơn hàng và khách hàng với biểu đồ Recharts.
  - Quản lý Sản phẩm (CRUD, upload ảnh raster an toàn, xóa mềm `isDeleted`), Danh mục (CRUD + chặn xóa danh mục còn sản phẩm), Mã giảm giá (tạo/sửa/bật-tắt `isActive`), Đơn hàng (lọc, tìm kiếm, phân trang, xử lý hoàn tiền) và Nhật ký quản trị (**Audit Logs**).
- **Bảo mật, Hiệu năng & Vận hành:**
  - Xác thực JWT + Refresh Token Rotation (băm SHA-256, tối đa 5 phiên, thu hồi khi đổi mật khẩu), đăng nhập Firebase/Google OAuth (yêu cầu `email_verified`), quên/đặt lại mật khẩu qua SMTP Nodemailer.
  - Trừ tồn kho và tăng lượt dùng coupon nguyên tử (atomic updates) chống vượt bán (overselling).
  - Socket.IO xác thực JWT phân tách room (`role:admin`, `user:<id>`).
  - Redis cache cho danh mục/sản phẩm với cơ chế tự động xóa cache theo prefix khi ghi dữ liệu.
  - Code-splitting frontend (`React.lazy` + vendor chunks), kiểm thử tự động Backend/Frontend và GitHub Actions CI.

---

## Công Nghệ Sử Dụng (Tech Stack)

| Thành phần | Công nghệ |
| :--- | :--- |
| **Frontend** | React 18, Vite 6, React Router 6, TailwindCSS 4, Framer Motion, Recharts, Lucide, Firebase Auth, Socket.IO Client |
| **Backend** | Node.js 22, Express, TypeScript, Mongoose 9 (MongoDB), Redis 6, Socket.IO, Nodemailer, Multer, Helmet, Firebase Admin |
| **Thanh toán & AI** | VNPAY Sandbox, COD, Multi-provider LLM (Gemini / OpenAI / Groq / OpenRouter / DeepSeek / Ollama) |
| **Kiểm thử & CI/CD** | Vitest + `mongodb-memory-server` (Backend), Node `node:test` (Frontend), GitHub Actions, Docker & Nginx |
| **Kiến trúc** | NPM Workspaces Monorepo (`backend` + `frontend`) |

---

## Cấu Trúc Dự Án

```text
Multi-product store/
├── backend/                # Express TypeScript API Backend
│   ├── src/
│   │   ├── app.ts          # Khởi tạo Express app & middleware (tách khỏi server)
│   │   ├── server.ts       # Khởi chạy HTTP + Socket.IO server & background jobs
│   │   ├── config/         # MongoDB, Redis, Security, Socket.IO, Seed data
│   │   ├── controllers/    # HTTP request/response handlers
│   │   ├── middleware/     # JWT auth, RBAC, error handler
│   │   ├── models/         # Mongoose Schemas & Indexes
│   │   ├── routes/         # REST API & Multer upload routes
│   │   └── services/       # Nghiệp vụ: Auth, Order, Payment, Product, Cache, AI, Audit
│   ├── tests/              # Bộ test Vitest (unit + HTTP integration)
│   ├── Dockerfile          # Multi-stage Node 22 Alpine image
│   └── .env.example        # Mẫu cấu hình biến môi trường
├── frontend/               # Ứng dụng React + Vite SPA
│   ├── src/
│   │   ├── components/     # UI dùng chung (Navbar, AdminNav, ErrorBoundary, AI Chat...)
│   │   ├── context/        # Auth, Cart, Wishlist, Theme, Toast contexts
│   │   ├── pages/          # Storefront & Admin Portal pages
│   │   ├── services/       # API client & Socket.IO client
│   │   ├── styles/         # UCONEXT Dual-Theme CSS tokens
│   │   └── utils/          # Formatters & helpers
│   ├── tests/              # Bộ test Frontend (Node built-in test runner)
│   ├── Dockerfile          # Multi-stage Vite build -> Nginx Alpine
│   ├── nginx.conf          # SPA fallback + reverse proxy (/api, /uploads, /socket.io)
│   └── .env.example        # Mẫu biến môi trường Firebase phía client
├── .github/workflows/ci.yml# CI: Backend typecheck/build/test + Frontend build/test
├── docker-compose.yml      # Stack đầy đủ: mongodb, redis, backend, frontend
├── doc/                    # Tài liệu kiến trúc chi tiết
└── package.json            # NPM Workspaces root scripts
```

---

## Chạy Nhanh Với Docker (Khuyên Dùng)

Yêu cầu: **Docker Engine** & **Docker Compose v2**.

```bash
docker compose up --build
```

Sau khi các container khởi động và pass healthcheck:
- **Frontend (Nginx SPA + API/WS Proxy):** [http://localhost:3000](http://localhost:3000)
- **Backend API & Healthcheck:** [http://localhost:5000/api/health](http://localhost:5000/api/health)

> **Lưu ý Production:** Trước khi triển khai thực tế, hãy ghi đè `JWT_SECRET`, `JWT_REFRESH_SECRET` (tối thiểu 24 ký tự mạnh), `CLIENT_URL`/`CORS_ORIGINS`, `VNPAY_HASH_SECRET` (nếu bật VNPAY) và đặt `AUTO_SEED=false`.

---

## Cài Đặt & Chạy Cục Bộ (Local Development)

### 1. Yêu cầu hệ thống
- **Node.js**: `>= 22.x`
- **NPM**: `>= 10.x`
- **MongoDB**: cục bộ (`27017`) hoặc MongoDB Atlas
- **Redis** *(khuyến nghị)*: cổng `6379` để kích hoạt cache

### 2. Cài đặt Dependencies

```bash
npm install
```

### 3. Cấu hình Biến Môi Trường

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Cập nhật các thông số trong `backend/.env` (và `frontend/.env` nếu dùng đăng nhập Firebase/Google).

### 4. Khởi chạy Ứng dụng

Mở 2 cửa sổ terminal tại thư mục gốc:

```bash
# Terminal 1 — Backend API (port 5000)
npm run dev:backend

# Terminal 2 — Frontend Vite dev server (port 3000)
npm run dev:frontend
```

---

## Kiểm Thử & Build

```bash
# Chạy toàn bộ test (Backend Vitest + Frontend node:test)
npm test

# Type-check & build Backend (bao gồm type-check thư mục tests)
npm run typecheck:backend

# Build Frontend cho Production
npm run build:frontend
```

---

## Tài Khoản Trải Nghiệm Mẫu

Khi `AUTO_SEED=true` (mặc định ở chế độ development và Docker demo), hệ thống tự động tạo tài khoản mẫu:

| Vai trò | Email | Mật khẩu |
| :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin@glowstore.com` | `admin123` |
| **Khách hàng (Customer)** | `customer@glowstore.com` | `customer123` |

---

## Tài Liệu Bổ Sung

Xem thêm tài liệu kiến trúc phân lớp và thiết kế hệ thống tại [doc/README.md](./doc/README.md).
