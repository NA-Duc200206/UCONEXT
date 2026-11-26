import { describe, it, expect } from 'vitest';
import {
  isOriginAllowed,
  parseAllowedOrigins,
  shouldAutoSeed,
  validateProductionEnv,
} from '../src/config/security';

describe('security & production config', () => {
  it('parses comma-separated CLIENT_URL and CORS_ORIGINS and strips trailing slashes', () => {
    const origins = parseAllowedOrigins({
      NODE_ENV: 'production',
      CLIENT_URL: 'https://uconext.com/',
      CORS_ORIGINS: ' https://www.uconext.com/ , https://uconext.com ',
    });

    expect(origins).toEqual(['https://uconext.com', 'https://www.uconext.com']);
  });

  it('enforces strict CORS whitelist in production while allowing localhost in development', () => {
    const allowed = ['https://uconext.com'];

    expect(isOriginAllowed(undefined, allowed, true)).toBe(true);
    expect(isOriginAllowed('https://uconext.com/', allowed, true)).toBe(true);
    expect(isOriginAllowed('https://evil.example', allowed, true)).toBe(false);
    expect(isOriginAllowed('http://localhost:3000', allowed, true)).toBe(false);

    // Development allows localhost ports
    expect(isOriginAllowed('http://localhost:5173', allowed, false)).toBe(true);
    expect(isOriginAllowed('https://evil.example', allowed, false)).toBe(false);
  });

  it('disables automatic seeding in production unless AUTO_SEED=true', () => {
    expect(shouldAutoSeed({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldAutoSeed({ NODE_ENV: 'production' })).toBe(false);
    expect(shouldAutoSeed({ NODE_ENV: 'production', AUTO_SEED: 'true' })).toBe(true);
    expect(shouldAutoSeed({ NODE_ENV: 'development', AUTO_SEED: 'false' })).toBe(false);
  });

  it('validates required production environment variables', () => {
    expect(validateProductionEnv({ NODE_ENV: 'development' })).toEqual([]);

    const missing = validateProductionEnv({ NODE_ENV: 'production' });
    expect(missing.length).toBeGreaterThanOrEqual(4);

    const placeholderSecret = validateProductionEnv({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://cluster.example/uconext',
      JWT_SECRET: 'a_very_strong_random_production_secret_key_2026',
      JWT_REFRESH_SECRET: 'your_jwt_refresh_secret_key_here',
      VNPAY_HASH_SECRET: 'HJGBUYTREWQLKJHGFDSAZXCVBNMKIOP',
      CLIENT_URL: 'https://uconext.com',
      SMTP_HOST: 'smtp.uconext.com',
      SMTP_USER: 'no-reply@uconext.com',
      SMTP_PASS: 'strong-smtp-pass-2026',
    });
    expect(placeholderSecret).toHaveLength(2);

    const valid = validateProductionEnv({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://cluster.example/uconext',
      JWT_SECRET: 'a_very_strong_random_production_secret_key_2026',
      JWT_REFRESH_SECRET: 'another_strong_random_refresh_secret_key_2026',
      CLIENT_URL: 'https://uconext.com',
      SMTP_HOST: 'smtp.uconext.com',
      SMTP_USER: 'no-reply@uconext.com',
      SMTP_PASS: 'strong-smtp-pass-2026',
    });
    expect(valid).toEqual([]);

    // Render Free Blueprint auto-injects RENDER_EXTERNAL_URL without requiring CLIENT_URL beforehand
    const renderOrigins = parseAllowedOrigins({
      NODE_ENV: 'production',
      RENDER_EXTERNAL_URL: 'https://uconext-demo.onrender.com/',
    });
    expect(renderOrigins).toEqual(['https://uconext-demo.onrender.com']);

    const validOnRender = validateProductionEnv({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://cluster.example/uconext',
      JWT_SECRET: 'a_very_strong_random_production_secret_key_2026',
      JWT_REFRESH_SECRET: 'another_strong_random_refresh_secret_key_2026',
      RENDER_EXTERNAL_URL: 'https://uconext-demo.onrender.com',
      SMTP_HOST: 'smtp.uconext.com',
      SMTP_USER: 'no-reply@uconext.com',
      SMTP_PASS: 'strong-smtp-pass-2026',
    });
    expect(validOnRender).toEqual([]);
  });
});

