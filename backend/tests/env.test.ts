import { describe, it, expect } from 'vitest';
import {
  getJwtSecret,
  getJwtRefreshSecret,
  getVnpayConfig,
  isVnpayEnabled,
  validateProductionEnv,
} from '../src/config/env';

const BASE_VALID_PROD_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb+srv://cluster.example/uconext',
  CLIENT_URL: 'https://uconext.vn',
  JWT_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'no-reply@uconext.vn',
  SMTP_PASS: 'strong-smtp-password',
};

describe('centralized env config & fail-closed production validation', () => {
  it('rejects docker-compose and legacy placeholder JWT secrets and short (<32) secrets in production', () => {
    const dockerPlaceholder = validateProductionEnv({
      ...BASE_VALID_PROD_ENV,
      JWT_SECRET: 'uconext_docker_dev_jwt_secret_change_in_prod_2026',
    });
    expect(dockerPlaceholder.some((i) => i.includes('JWT_SECRET'))).toBe(true);

    const legacyPlaceholder = validateProductionEnv({
      ...BASE_VALID_PROD_ENV,
      JWT_REFRESH_SECRET: 'super_secret_jwt_key_glowstore_2026',
    });
    expect(legacyPlaceholder.some((i) => i.includes('JWT_REFRESH_SECRET'))).toBe(true);

    const tooShort = validateProductionEnv({
      ...BASE_VALID_PROD_ENV,
      JWT_SECRET: 'short_secret_24_chars_12',
    });
    expect(tooShort.some((i) => i.includes('JWT_SECRET'))).toBe(true);
  });

  it('requires VNPAY secrets when PAYMENTS_VNPAY_ENABLED=true and rejects mock placeholders', () => {
    const missingVnpay = validateProductionEnv({
      ...BASE_VALID_PROD_ENV,
      PAYMENTS_VNPAY_ENABLED: 'true',
      VNPAY_TMN_CODE: '',
      VNPAY_HASH_SECRET: '',
    });
    expect(missingVnpay.some((i) => i.includes('VNPAY_TMN_CODE'))).toBe(true);
    expect(missingVnpay.some((i) => i.includes('VNPAY_HASH_SECRET'))).toBe(true);
    expect(missingVnpay.some((i) => i.includes('VNPAY_RETURN_URL'))).toBe(true);

    const mockVnpay = validateProductionEnv({
      ...BASE_VALID_PROD_ENV,
      PAYMENTS_VNPAY_ENABLED: 'true',
      VNPAY_TMN_CODE: 'mock_tmn_code',
      VNPAY_HASH_SECRET: 'mock_hash_secret',
      VNPAY_RETURN_URL: 'https://uconext.vn/payment-result',
    });
    expect(mockVnpay.some((i) => i.includes('VNPAY_TMN_CODE'))).toBe(true);
    expect(mockVnpay.some((i) => i.includes('VNPAY_HASH_SECRET'))).toBe(true);

    const validVnpay = validateProductionEnv({
      ...BASE_VALID_PROD_ENV,
      PAYMENTS_VNPAY_ENABLED: 'true',
      VNPAY_TMN_CODE: 'REALMERCHANT01',
      VNPAY_HASH_SECRET: 'c'.repeat(32),
      VNPAY_RETURN_URL: 'https://uconext.vn/payment-result',
    });
    expect(validVnpay).toEqual([]);
  });

  it('requires SMTP in production', () => {
    const missingSmtp = validateProductionEnv({
      ...BASE_VALID_PROD_ENV,
      SMTP_HOST: '',
    });
    expect(missingSmtp.some((i) => i.includes('SMTP'))).toBe(true);
  });

  it('rejects AUTO_SEED=true in production unless ALLOW_PROD_SEED=true', () => {
    const blocked = validateProductionEnv({
      ...BASE_VALID_PROD_ENV,
      AUTO_SEED: 'true',
    });
    expect(blocked.some((i) => i.includes('AUTO_SEED'))).toBe(true);

    const allowed = validateProductionEnv({
      ...BASE_VALID_PROD_ENV,
      AUTO_SEED: 'true',
      ALLOW_PROD_SEED: 'true',
    });
    expect(allowed).toEqual([]);
  });

  it('getVnpayConfig returns null when VNPAY is disabled or misconfigured', () => {
    expect(isVnpayEnabled({})).toBe(false);
    expect(getVnpayConfig({})).toBeNull();
    expect(
      getVnpayConfig({
        PAYMENTS_VNPAY_ENABLED: 'false',
        VNPAY_TMN_CODE: 'REALTMN',
        VNPAY_HASH_SECRET: 'd'.repeat(32),
      })
    ).toBeNull();
    expect(
      getVnpayConfig({
        PAYMENTS_VNPAY_ENABLED: 'true',
        VNPAY_TMN_CODE: 'mock_tmn_code',
        VNPAY_HASH_SECRET: 'mock_hash_secret',
      })
    ).toBeNull();

    const cfg = getVnpayConfig({
      PAYMENTS_VNPAY_ENABLED: 'true',
      VNPAY_TMN_CODE: 'REALTMN1',
      VNPAY_HASH_SECRET: 'e'.repeat(32),
      VNPAY_RETURN_URL: 'https://uconext.vn/payment-result',
    });
    expect(cfg).toEqual({
      tmnCode: 'REALTMN1',
      hashSecret: 'e'.repeat(32),
      url: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      returnUrl: 'https://uconext.vn/payment-result',
    });
  });

  it('generates consistent random ephemeral secrets in dev/test and throws in production when missing', () => {
    const devJwt1 = getJwtSecret({ NODE_ENV: 'test' });
    const devJwt2 = getJwtSecret({ NODE_ENV: 'test' });
    expect(devJwt1).toBe(devJwt2);
    expect(devJwt1.length).toBeGreaterThanOrEqual(64);
    expect(devJwt1).not.toBe('super_secret_jwt_key_glowstore_2026');

    const devRt = getJwtRefreshSecret({ NODE_ENV: 'test' });
    expect(devRt.length).toBeGreaterThanOrEqual(64);

    expect(() => getJwtSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => getJwtRefreshSecret({ NODE_ENV: 'production' })).toThrow(/JWT_REFRESH_SECRET/);
  });
});
