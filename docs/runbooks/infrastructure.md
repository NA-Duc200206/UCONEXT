# Infrastructure & Secrets Runbook

## 1. Target Topology

```text
Internet
  │ HTTPS (TLS 1.3, Cloudflare WAF + Rate Rules)
  ▼
Cloudflare Edge (Proxied DNS, SSL Full Strict + Origin Certificate)
  │ CF-Connecting-IP forwarded
  ▼
Ubuntu LTS VPS (ufw: 22/80/443 only, fail2ban, unattended-upgrades)
  ├─ Host Reverse Proxy (TLS termination via Cloudflare Origin Cert)
  └─ Docker Compose (docker-compose.prod.yml)
       ├─ frontend (Nginx unprivileged :8080, bound to 127.0.0.1:3000)
       │    ├─ /index.html          -> Cache-Control: no-cache
       │    ├─ /assets/*            -> Cache-Control: public, immutable (1y)
       │    ├─ /api/ai/*            -> upstream backend_api (120s timeout)
       │    ├─ /api/* & /uploads/*  -> upstream backend_api (keepalive 32)
       │    └─ /socket.io/*         -> WebSocket upgrade proxy
       └─ backend (Node 22 non-root :5000, internal network only)
            ├─ MongoDB Atlas M10 (TLS, IP allowlist = VPS IP, Continuous PITR)
            ├─ Upstash / Redis Cloud (TLS rediss://, password auth)
            ├─ Cloudflare R2 (bucket: uconext-media -> media.uconext.vn)
            ├─ Transactional SMTP (SES / Brevo / Postmark, SPF+DKIM+DMARC)
            └─ Sentry (backend & frontend error telemetry)
```

## 2. Managed Services Provisioning Checklist

### MongoDB Atlas
- Tier: **M10+** dedicated replica set in the nearest region to the VPS (e.g. `ap-southeast-1` Singapore).
- Network Access: Restrict IP allowlist strictly to the staging and production VPS egress IPs (never `0.0.0.0/0`).
- Database User: Dedicated least-privilege account with `readWrite` on database `uconext` only (separate credentials per environment).
- Backup: Enable **Continuous Cloud Backup (PITR)** + daily snapshots retained for 30 days.

### Managed Redis (Upstash / Redis Cloud)
- Enforce TLS (`rediss://`) and strong password authentication.
- Used for rate-limit state (`ResilientRedisStore`), catalog cache, distributed job locks (`lock:*`), and email queue (`queue:email:*`).

### Object Storage (Cloudflare R2)
- Bucket: `uconext-media` (staging: `uconext-media-staging`).
- Custom public domain: `media.uconext.vn` (whitelisted in `frontend/security-headers.conf` `img-src`).
- Enable object versioning and 30-day noncurrent version lifecycle rule.

### VPS Baseline Hardening (Ubuntu 24.04 LTS)
1. Create non-root deploy user (`uconext`) with SSH key-only authentication; set `PasswordAuthentication no` and `PermitRootLogin no` in `/etc/ssh/sshd_config`.
2. Configure firewall: `ufw default deny incoming && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable`.
3. Install & enable `fail2ban` (sshd jail) and `unattended-upgrades`.
4. Install Docker Engine + Docker Compose plugin; add `uconext` to the `docker` group.
5. Keep application files and `.env` (chmod `600`) in `/opt/uconext`.

### Cloudflare Edge Configuration
- DNS: Orange-cloud proxy ON for `uconext.vn`, `staging.uconext.vn`, and `media.uconext.vn`.
- SSL/TLS: **Full (strict)** with a Cloudflare Origin Certificate installed on the VPS edge.
- WAF: Enable Cloudflare Managed Ruleset + OWASP Core Ruleset.
- Rate Limiting Rule: Throttle `/api/auth/*` (e.g. 20 req / min per IP) at the edge in addition to Express rate limits.
- Verify headers after deploy:
  - `curl -I https://staging.uconext.vn/` -> `cache-control: no-cache`
  - `curl -I https://staging.uconext.vn/assets/<entry>.js` -> `cache-control: public, immutable`

### Transactional Email Deliverability
- Provision Amazon SES, Brevo, or Postmark with verified sending domain `uconext.vn`.
- Publish DNS records:
  - **SPF**: `v=spf1 include:<provider-spf> ~all`
  - **DKIM**: Provider-issued CNAME / TXT selector keys
  - **DMARC**: `_dmarc.uconext.vn` -> `v=DMARC1; p=quarantine; rua=mailto:dmarc@uconext.vn`

## 3. Secrets Inventory & Rotation Policy

All deployment secrets are stored in **GitHub Environments** (`staging` and `production`) and on the VPS in `/opt/uconext/.env` (`chmod 600`, never committed to git).

| Secret / Variable | Scope | Rotation Cadence | Rotation Procedure |
|---|---|---|---|
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | VPS `.env` | Every 90 days or incident | Generate 32-byte hex (`openssl rand -hex 32`), update `.env`, restart backend (`docker compose -f docker-compose.prod.yml up -d backend`). Existing sessions re-authenticate cleanly. |
| `MONGODB_URI` | VPS `.env` | Every 90 days | Create new Atlas DB user, update `.env`, restart backend, verify `/api/health/ready`, delete old Atlas user. |
| `REDIS_URL` | VPS `.env` | Every 90 days | Rotate Redis password in provider console, update `.env`, restart backend. |
| `VNPAY_HASH_SECRET` | VPS `.env` | Per merchant policy | Coordinate secret update in VNPAY merchant portal and `.env` during low-traffic window. |
| `SMTP_PASS` | VPS `.env` | Every 90 days | Issue new SMTP API key in SES/Brevo/Postmark, update `.env`, restart backend, revoke old key. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | VPS `.env` | Every 90 days | Create new R2 API token, update `.env`, restart backend, revoke old token. |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | VPS `.env` & GitHub Env Vars | On exposure | Rotate DSN in Sentry project settings and trigger rebuild for frontend. |
| `HEALTH_READY_TOKEN` | VPS `.env` & monitor | Every 180 days | Update token in `.env` and internal monitoring check simultaneously. |
| `DEPLOY_SSH_KEY` | GitHub Env Secrets | Every 180 days | Add new public key to VPS `~/.ssh/authorized_keys`, update GitHub secret, remove old key. |

## 4. Monitoring & Alerting Thresholds

Configure Better Stack or UptimeRobot plus Sentry alerts routed to Telegram + on-call email:

| Signal | Source | Threshold | Action |
|---|---|---|---|
| Public liveness `/api/health` | Better Stack / UptimeRobot (1m interval) | 2 consecutive non-200 checks | Page on-call immediately; inspect VPS & Atlas status. |
| 5xx Error Rate | Cloudflare Analytics / Sentry | > 2% over 5 minutes | Investigate latest deploy; execute rollback if correlated. |
| API Latency (p95) | Cloudflare / APM | > 1.5s over 5 minutes | Inspect slow MongoDB queries and upstream LLM/SMTP timeouts. |
| Unreconciled VNPAY Orders | MongoDB / Admin query (`paymentStatus: 'review'`) | Any new order | Manual reconciliation against VNPAY merchant portal within 1 hour. |
| Daily AI Token Budget | Redis key `ai:budget:YYYY-MM-DD` | > 80% of `AI_DAILY_TOKEN_BUDGET` | Review traffic anomalies or adjust daily cap. |
| Email Dead-Letter Queue | Redis key `queue:email:dead` | `LLEN > 0` | Inspect SMTP relay health and replay failed notifications. |
