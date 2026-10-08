import { describe, expect, it } from 'vitest';
import { activationCode, activationExpiresAt, isValidActivationCode } from './mobile-activation';

const secret = 'a-private-deployment-secret-longer-than-32-characters';

describe('mobile activation', () => {
  it('accepts only the current time window', () => {
    const now = 100_000;
    const code = activationCode(secret, now);
    expect(isValidActivationCode(code.toLowerCase(), secret, now)).toBe(true);
    expect(isValidActivationCode(code, secret, 600_000)).toBe(false);
    expect(activationExpiresAt(now)).toBe(new Date(600_000).toISOString());
  });

  it('rejects malformed codes and weak deployment secrets', () => {
    expect(isValidActivationCode('invalid', secret)).toBe(false);
    expect(() => activationCode('weak')).toThrow();
  });
});
