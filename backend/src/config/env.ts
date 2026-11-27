import crypto from 'crypto';

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  url: string;
  returnUrl: string;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// SHA-256 digests of known insecure dev/example/docker placeholders (stored hashed so no literal fallback secrets exist in source)
const INSECURE_JWT_SECRET_HASHES = new Set([
  '38870238ba0a8baaccffce8a66e37898416a021797e7e6b568af7d8d4fa3cd10', // your_jwt_secret_key_here
  '6fa8f2ae63dc8ed7aaf15d1c0e48b999cf13ebc2db15394c3a0fdc83cd2a9372', // your_jwt_refresh_secret_key_here
  'cd240660265370a46e8f13b0c113a73034adea88d280e0d72769e93e3407b453', // legacy glowstore jwt placeholder
  '68301886df470b1f01e8e07a3f6c25f5b6cb55d15f42e115d95c95a85c4d0fb2', // docker-compose dev jwt placeholder
  'c947f10c850bfb808aa6026fd6dcf749a32fadc0af28d3dff014afd4e8316acf', // docker-compose dev refresh placeholder
  '057ba03d6c44104863dc7361fe4578965d1887360f90a0895882e58a6248fc86', // changeme
  '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b', // secret
]);

const INSECURE_VNPAY_SECRET_HASHES = new Set([
  '70c0cee8f11babd3bd1b183b26050f3299f799432642a8c3c6d2c7a659122f17', // legacy mock hash secret
  '05c19b96bd63b1406ab7acfa77f2da0458124e6070a56ea2496482610a785e9e', // legacy mock tmn code
  '5f02dc05d3f035fe6645a74e0ee7360ff9e8a22787572ac4fca90ab430b7195b', // public sandbox sample hash secret
  'eba531a199b015744dac2616f304e849761d5bc54cf4472f62d27fd7039c3926', // your_vnpay_hash_secret_here
]);

const MIN_JWT_SECRET_LENGTH = 32;

// Ephemeral per-process secrets for local dev/test when env vars are omitted
let ephemeralDevJwtSecret: string | null = null;
let ephemeralDevRefreshSecret: string | null = null;

function isInsecureJwtSecret(secret: string): boolean {
  return !secret || secret.length < MIN_JWT_SECRET_LENGTH || INSECURE_JWT_SECRET_HASHES.has(sha256(secret));
}

function isInsecureVnpayValue(value: string): boolean {
  return !value || INSECURE_VNPAY_SECRET_HASHES.has(sha256(value));
}

export function getJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.JWT_SECRET?.trim();
  if (configured) {
    if (env.NODE_ENV === 'production' && isInsecureJwtSecret(configured)) {
      throw new Error('JWT_SECRET is weak or uses an insecure placeholder in production.');
    }
    return configured;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production.');
  }

  if (!ephemeralDevJwtSecret) {
    ephemeralDevJwtSecret = crypto.randomBytes(32).toString('hex');
  }
  return ephemeralDevJwtSecret;
}

export function getJwtRefreshSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.JWT_REFRESH_SECRET?.trim();
  if (configured) {
    if (env.NODE_ENV === 'production' && isInsecureJwtSecret(configured)) {
      throw new Error('JWT_REFRESH_SECRET is weak or uses an insecure placeholder in production.');
    }
    return configured;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_REFRESH_SECRET is required in production.');
  }

  if (!ephemeralDevRefreshSecret) {
    ephemeralDevRefreshSecret = crypto.randomBytes(32).toString('hex');
  }
  return ephemeralDevRefreshSecret;
}

export function isVnpayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.PAYMENTS_VNPAY_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

export function getVnpayConfig(env: NodeJS.ProcessEnv = process.env): VnpayConfig | null {
  if (!isVnpayEnabled(env)) {
    return null;
  }

  const tmnCode = env.VNPAY_TMN_CODE?.trim() || '';
  const hashSecret = env.VNPAY_HASH_SECRET?.trim() || '';
  const url = env.VNPAY_URL?.trim() || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  const returnUrl = env.VNPAY_RETURN_URL?.trim() || 'http://localhost:3000/payment-result';

  if (
    !tmnCode ||
    !hashSecret ||
    hashSecret.length < 16 ||
    isInsecureVnpayValue(tmnCode) ||
    isInsecureVnpayValue(hashSecret)
  ) {
    return null;
  }

  return { tmnCode, hashSecret, url, returnUrl };
}

export function validateProductionEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') {
    return [];
  }

  const issues: string[] = [];

  if (!env.MONGODB_URI?.trim()) {
    issues.push('MONGODB_URI is required in production.');
  }

  const jwtSecret = env.JWT_SECRET?.trim() || '';
  if (isInsecureJwtSecret(jwtSecret)) {
    issues.push(
      `JWT_SECRET must be set to a strong non-placeholder secret (at least ${MIN_JWT_SECRET_LENGTH} characters) in production.`
    );
  }

  const jwtRefreshSecret = env.JWT_REFRESH_SECRET?.trim() || '';
  if (isInsecureJwtSecret(jwtRefreshSecret)) {
    issues.push(
      `JWT_REFRESH_SECRET must be set to a strong non-placeholder secret (at least ${MIN_JWT_SECRET_LENGTH} characters) in production.`
    );
  }

  if (!env.CLIENT_URL?.trim() && !env.CORS_ORIGINS?.trim() && !env.RENDER_EXTERNAL_URL?.trim()) {
    issues.push('CLIENT_URL (or CORS_ORIGINS) must be configured in production for CORS whitelist.');
  }

  const smtpHost = env.SMTP_HOST?.trim();
  const smtpUser = env.SMTP_USER?.trim();
  const smtpPass = env.SMTP_PASS?.trim();
  if (!smtpHost || !smtpUser || !smtpPass) {
    issues.push('SMTP_HOST, SMTP_USER, and SMTP_PASS are required in production.');
  }

  const autoSeedRaw = env.AUTO_SEED?.trim().toLowerCase();
  const allowProdSeedRaw = env.ALLOW_PROD_SEED?.trim().toLowerCase();
  if ((autoSeedRaw === 'true' || autoSeedRaw === '1') && allowProdSeedRaw !== 'true' && allowProdSeedRaw !== '1') {
    issues.push('AUTO_SEED=true is forbidden in production unless ALLOW_PROD_SEED=true.');
  }

  const vnpaySecret = env.VNPAY_HASH_SECRET?.trim() || '';
  const vnpayTmn = env.VNPAY_TMN_CODE?.trim() || '';
  if (isVnpayEnabled(env)) {
    if (!vnpayTmn || isInsecureVnpayValue(vnpayTmn)) {
      issues.push('VNPAY_TMN_CODE must be set to a valid merchant terminal code when PAYMENTS_VNPAY_ENABLED=true.');
    }
    if (!vnpaySecret || vnpaySecret.length < 16 || isInsecureVnpayValue(vnpaySecret)) {
      issues.push('VNPAY_HASH_SECRET must be set to a strong non-placeholder secret when PAYMENTS_VNPAY_ENABLED=true.');
    }
    if (!env.VNPAY_RETURN_URL?.trim()) {
      issues.push('VNPAY_RETURN_URL is required when PAYMENTS_VNPAY_ENABLED=true.');
    }
  } else if (vnpaySecret && (vnpaySecret.length < 16 || isInsecureVnpayValue(vnpaySecret))) {
    issues.push('VNPAY_HASH_SECRET cannot use a public sandbox placeholder or weak secret in production.');
  }

  return issues;
}
