import { validateProductionEnv } from './env';

const DEFAULT_DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function parseAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = [env.CLIENT_URL, env.CORS_ORIGINS, env.RENDER_EXTERNAL_URL].filter(Boolean).join(',');
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

export { validateProductionEnv };
