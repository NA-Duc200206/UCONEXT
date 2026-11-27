# Backup & Disaster Recovery Runbook

## 1. Recovery Objectives

| Metric | Target | Enforcement Mechanism |
|---|---|---|
| **RPO** (Recovery Point Objective) | **<= 1 hour** | MongoDB Atlas Continuous Cloud Backup (PITR) oplog capture + Cloudflare R2 object versioning |
| **RTO** (Recovery Time Objective) | **<= 4 hours** | Automated GHCR container re-deployment (`docker-compose.prod.yml`) + Atlas restore-to-cluster |

## 2. Backup Architecture
- **Database (MongoDB Atlas):**
  - Continuous Backup (Point-in-Time Recovery) enabled with 7-day PITR window.
  - Automated daily snapshots retained for **30 days**.
  - Cross-region snapshot copy enabled for primary production cluster.
- **Media Storage (Cloudflare R2 `uconext-media`):**
  - Bucket object versioning enabled.
  - Lifecycle rule retains noncurrent/deleted object versions for **30 days** before permanent purge.
- **Configuration & Code:**
  - Application code, Dockerfiles, Nginx configs, and Compose manifests are versioned in GitHub (`main` + release tags).
  - Encrypted copy of production `.env` secrets stored in team password manager (1Password / Bitwarden) + GitHub Environments.

## 3. Restore Drill Procedure (Run Quarterly & Before Launch)

Perform restore drills in an isolated temporary Atlas cluster — **never** overwrite production directly during a drill:

1. **Provision Temporary Cluster:**
   - In MongoDB Atlas, select **Backup -> Snapshots** (or **Continuous Backup -> Restore to Point in Time**).
   - Restore the latest snapshot to a temporary M10 cluster `uconext-dr-drill`.
2. **Point Staging App at Restored Cluster:**
   - Update `MONGODB_URI` in the staging VPS `/opt/uconext/.env` to point to `uconext-dr-drill`.
   - Restart backend: `docker compose -f docker-compose.prod.yml up -d --wait backend`.
3. **Verify Data Integrity:**
   - Check readiness: `curl -fsS https://staging.uconext.vn/api/health` -> `{"status":"ok"}`.
   - Verify document counts (`users`, `products`, `orders`, `coupons`, `reviews`, `auditlogs`) match pre-snapshot production counts.
   - Sign in as an admin on staging and verify recent orders, inventory stock counts, and audit log entries render cleanly.
   - Verify a recently uploaded media asset loads from `https://media.uconext.vn/...`.
4. **Teardown & Restore Staging Pointer:**
   - Point staging `.env` back to the normal staging Atlas cluster and restart backend.
   - Terminate the temporary `uconext-dr-drill` cluster.

## 4. Disaster Recovery Execution (Full Outage)

1. Declare incident and notify stakeholders.
2. If MongoDB data corruption or accidental deletion occurred:
   - Use Atlas **Point-in-Time Restore** to the exact UTC minute immediately prior to corruption into a fresh cluster.
   - Update `MONGODB_URI` in `/opt/uconext/.env` and restart `backend`.
3. If the VPS host is lost:
   - Provision a fresh Ubuntu LTS VPS following `docs/runbooks/infrastructure.md`.
   - Restore `/opt/uconext/.env` from the encrypted vault.
   - Update Cloudflare DNS A/AAAA record and Atlas IP allowlist to the new VPS IP.
   - Trigger `Actions -> Deploy` (or run `docker compose -f docker-compose.prod.yml up -d --wait`).
4. Verify `/api/health`, `/api/health/ready`, checkout flow, VNPAY callback reachability, and Socket.IO connectivity.

## 5. Restore Drill Log

| Date (UTC) | Operator | Snapshot / PITR Target | Measured RPO | Measured RTO | Verification Result |
|---|---|---|---|---|---|
| _Pending pre-launch drill_ | — | — | <= 1h target | <= 4h target | Complete before production go-live |
