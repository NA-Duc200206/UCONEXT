# Deployment & Rollback Runbook

## 1. Release Flow

1. **Staging (automatic):** Merging a PR into `dev` triggers `.github/workflows/deploy.yml`:
   - Builds `uconext-backend` and `uconext-frontend` images and pushes them to `ghcr.io/<owner>/uconext-{backend,frontend}:sha-<12chars>`.
   - Copies `docker-compose.prod.yml` to the staging VPS, pulls the new tag, starts containers with `--wait`, and verifies `GET https://staging.uconext.vn/api/health` returns `{"status":"ok"}`.
   - If container startup or the health check fails, the workflow automatically restores `PREV_TAG` and restarts the previous release.
2. **Production (approval-gated):** Pushing a semantic version tag (`git tag v1.0.0 && git push origin v1.0.0`) builds immutable images tagged with both `sha-<12chars>` and `v1.0.0`, then pauses at the GitHub Environment `production` required-reviewers gate before deploying to `https://uconext.vn`.

## 2. Pre-Deployment Verification Checklist
- [ ] All CI jobs (`lint`, `backend`, `frontend`, `docker`, `e2e`, `audit`) are green on the release commit.
- [ ] Staging (`https://staging.uconext.vn`) has been verified with zero unresolved Sentry `error` issues.
- [ ] Any database migration scripts are backward-compatible and tested on staging first.

## 3. Manual Rollback (< 5 Minutes)

If a production issue is detected after deployment (e.g., elevated 5xx rate or Sentry regression), roll back immediately via either GitHub Actions or SSH:

### Option A — Via GitHub Actions (`workflow_dispatch`)
1. Open **Actions -> Deploy -> Run workflow**.
2. Select `target: production` and enter the last known-good tag in `image_tag` (e.g., `sha-a1b2c3d4e5f6` or `v1.0.0`).
3. Approve the `production` environment prompt and wait for the health smoke check to confirm green.

### Option B — Direct SSH on VPS (~2 minutes)
```bash
ssh uconext@<VPS_HOST>
cd /opt/uconext

# 1. Inspect available local/recent image tags
docker images | grep uconext

# 2. Switch IMAGE_TAG in .env back to the previous known-good sha
sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=sha-<PREVIOUS_12_CHAR_SHA>|' .env

# 3. Pull (if pruned) and restart cleanly
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --wait

# 4. Verify public health and internal readiness
curl -fsS http://127.0.0.1:3000/api/health
docker compose -f docker-compose.prod.yml exec -T backend \
  node -e "fetch('http://127.0.0.1:5000/api/health/ready').then(r=>r.text()).then(console.log)"
```

## 4. Post-Rollback Actions
1. Record the incident timestamp, bad `IMAGE_TAG`, rolled-back `IMAGE_TAG`, and root cause in the incident log.
2. Check `docker compose -f docker-compose.prod.yml logs --tail=200 backend` and Sentry for stack traces.
3. Verify no orders are stuck in `paymentStatus: "review"` or `queue:email:dead`.
