import { createHmac, timingSafeEqual } from 'node:crypto';

const WINDOW_MS = 10 * 60 * 1000;

export function activationCode(secret: string, now = Date.now()): string {
  if (secret.length < 32) throw new Error('MOBILE_ACTIVATION_SECRET harus berisi minimal 32 karakter');
  return createHmac('sha256', secret)
    .update(String(Math.floor(now / WINDOW_MS)))
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();
}

export function activationExpiresAt(now = Date.now()): string {
  return new Date((Math.floor(now / WINDOW_MS) + 1) * WINDOW_MS).toISOString();
}

export function isValidActivationCode(code: unknown, secret: string, now = Date.now()): boolean {
  if (typeof code !== 'string' || !/^[A-F0-9]{12}$/.test(code.trim().toUpperCase())) return false;
  const expected = Buffer.from(activationCode(secret, now));
  return timingSafeEqual(Buffer.from(code.trim().toUpperCase()), expected);
}
