const DEFAULT_DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function parseAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = [env.CLIENT_URL, env.CORS_ORIGINS].filter(Boolean).join(',');
  const parsed = raw
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  const unique = Array.from(new Set(parsed));
  if (unique.length > 0) {
    return unique;
  }

  return env.NODE_ENV === 'production' ? [] : DEFAULT_DEV_ORIGINS;
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  isProduction: boolean
): boolean {
  // Allow non-browser / same-origin / server-to-server requests without an Origin header
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.includes(normalized)) {
    return true;
  }

  if (!isProduction && LOCALHOST_ORIGIN_REGEX.test(normalized)) {
    return true;
  }

  return false;
}

export function shouldAutoSeed(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = env.AUTO_SEED?.trim().toLowerCase();
  if (explicit === 'true' || explicit === '1') return true;
  if (explicit === 'false' || explicit === '0') return false;
  return env.NODE_ENV !== 'production';
}

const INSECURE_JWT_PLACEHOLDERS = new Set([
  'your_jwt_secret_key_here',
  'your_jwt_refresh_secret_key_here',
  'super_secret_jwt_key_glowstore_2026',
  'changeme',
  'secret',
]);

export function validateProductionEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') {
    return [];
  }

  const issues: string[] = [];

  if (!env.MONGODB_URI?.trim()) {
    issues.push('MONGODB_URI is required in production.');
  }

  const jwtSecret = env.JWT_SECRET?.trim() || '';
  if (!jwtSecret || jwtSecret.length < 24 || INSECURE_JWT_PLACEHOLDERS.has(jwtSecret)) {
    issues.push('JWT_SECRET must be set to a strong secret (at least 24 characters) in production.');
  }

  if (!env.CLIENT_URL?.trim() && !env.CORS_ORIGINS?.trim()) {
    issues.push('CLIENT_URL (or CORS_ORIGINS) must be configured in production for CORS whitelist.');
  }

  return issues;
}

