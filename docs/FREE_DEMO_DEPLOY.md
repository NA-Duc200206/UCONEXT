# Free Demo Deployment Guide (0 VND)

Deploy the complete **UCONEXT** storefront (React SPA + Express/TypeScript API + Socket.IO + MongoDB + optional Redis + AI Shopping Assistant) on a free `https://<your-app>.onrender.com` URL with automatic HTTPS and zero credit card required.

## Free Stack Overview

| Component | Free Provider | Free Tier Allowance | Required? |
| --- | --- | --- | --- |
| App Hosting (SPA + API + Socket.IO) | [Render Web Service](https://render.com) | Free instance (`*.onrender.com` HTTPS, sleeps after 15 min idle) | Yes |
| Database | [MongoDB Atlas M0](https://www.mongodb.com/atlas) | 512 MB shared cluster forever free | Yes |
| Email (SMTP) | [Brevo](https://www.brevo.com) (300 emails/day free) or Gmail App Password | Free | Yes |
| Cache & Distributed Locks | [Upstash Redis](https://upstash.com) | 10,000 commands/day free (falls back locally if omitted) | Optional |
| AI Shopping Assistant | [OpenRouter](https://openrouter.ai) | Free `:free` models available | Optional |

Because `Dockerfile.render` bundles `frontend/dist` inside the Express server (`SERVE_FRONTEND_DIST=true`), the SPA, `/api/*`, `/uploads/*`, and `/socket.io` all share the exact same origin. This eliminates cross-origin cookie issues (`HttpOnly` refresh cookies work out of the box) and automatically trusts `RENDER_EXTERNAL_URL` for CORS.

---

## Step 1: Create a Free MongoDB Atlas M0 Cluster

1. Sign up at [MongoDB Atlas](https://www.mongodb.com/atlas) and create a **Free M0** cluster (Singapore region recommended).
2. Under **Database Access**, create a database user with read/write privileges and copy the password.
3. Under **Network Access**, add `0.0.0.0/0` (Render Free uses dynamic outbound IPs).
4. Click **Connect -> Drivers** and copy your connection string:
   ```text
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/uconext?retryWrites=true&w=majority
   ```

## Step 2: Get Free SMTP Credentials

Option A — **Brevo (recommended for demos)**:
- Create a free account at [Brevo](https://www.brevo.com) -> **SMTP & API -> SMTP**.
- `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER=<your login>`, `SMTP_PASS=<your SMTP key>`.

Option B — **Gmail App Password**:
- Enable 2-Step Verification on your Google Account and create an [App Password](https://myaccount.google.com/apppasswords).
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<your@gmail.com>`, `SMTP_PASS=<16-char app password>`.

## Step 3: Deploy One-Click via Render Blueprint

1. Open [Render Blueprints](https://dashboard.render.com/blueprints) and click **New Blueprint Instance**.
2. Connect this GitHub repository — Render automatically detects `render.yaml` and `Dockerfile.render`.
3. Fill in the prompted secrets:
   - `MONGODB_URI`: your Atlas connection string from Step 1
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: from Step 2
   - Optional: `REDIS_URL` (Upstash `rediss://...`), `OPENROUTER_API_KEY`
4. Click **Apply** and wait ~3–5 minutes for the Docker build and `/api/health` check to turn green.
   - `JWT_SECRET` and `JWT_REFRESH_SECRET` are auto-generated securely by Render.
   - `RENDER_EXTERNAL_URL` is injected automatically by Render and whitelisted for CORS.

## Step 4: Seed Demo Catalog & Admin Account (One Time)

Because Render Free does not include interactive shell access, pick either option below to populate the initial catalog and admin user:

### Option A — Seed directly from your local machine (recommended)

```bash
NODE_ENV=production \
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/uconext?retryWrites=true&w=majority" \
SEED_ADMIN_EMAIL="admin@example.com" \
SEED_ADMIN_PASSWORD="ChangeMeStrong123!" \
npm run build:backend && npm run seed --workspace=backend
```

### Option B — One-time auto-seed via Render Environment Variables

1. In your Render service **Environment** tab, temporarily set:
   - `SEED_ADMIN_EMAIL`: your admin email
   - `SEED_ADMIN_PASSWORD`: a strong password (at least 12 characters)
   - `AUTO_SEED=true`
   - `ALLOW_PROD_SEED=true`
2. Save and wait for the service to restart and log `Verified seed admin user`.
3. Immediately switch `AUTO_SEED` and `ALLOW_PROD_SEED` back to `false` so subsequent restarts boot faster.

---

## Demo Caveats to Keep in Mind

- **Cold starts:** Render Free sleeps after 15 minutes of inactivity; the first request after sleep takes ~30–50 seconds to wake up.
- **Ephemeral disk:** Files written to local `/uploads` are cleared on redeploy. Product catalog images use Unsplash CDN URLs so they persist across redeploys; for persistent user-uploaded avatars, configure optional Cloudflare R2 / S3 env vars (`S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`).
- **GitHub Actions Deploy workflow:** When `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, and `DEPLOY_SSH_KEY` are not configured in GitHub Environments, `.github/workflows/deploy.yml` builds and publishes container images to GHCR and skips VPS SSH deployment cleanly with a notice.
