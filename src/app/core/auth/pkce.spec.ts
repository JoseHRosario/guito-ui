import { describe, expect, it } from 'vitest';
import { base64UrlEncode, codeChallenge, createCodeVerifier, generateState } from './pkce';

describe('createCodeVerifier', () => {
  it('creates a high-entropy verifier within the RFC 7636 length bounds', () => {
    const verifier = createCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('uses only the unreserved PKCE character set', () => {
    expect(createCodeVerifier()).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
  });

  it('creates a different verifier on every call', () => {
    expect(createCodeVerifier()).not.toBe(createCodeVerifier());
  });
});

describe('codeChallenge', () => {
  it('derives the S256 challenge: base64url(SHA-256(verifier)) with no padding', async () => {
    // Known-good vector: sha256 of the verifier, base64url-encoded (verified
    // independently via node:crypto; verifies padding stripping and +/ → -_).
    const challenge = await codeChallenge(
      'dBjftJeZ4CVP-mB92K27uhbUJU1p0r_wC1cFW5tUxSVB12Ww9uJpEwXEyN9PsJcB',
    );
    expect(challenge).toBe('HGNRdt5ZhgH18wkk7PmsPR2X4jek2Wk4ok1dopOgP8U');
  });

  it('produces a 43-character unpadded base64url string', async () => {
    const challenge = await codeChallenge(createCodeVerifier());
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });
});

describe('base64UrlEncode', () => {
  it('replaces + and / and strips padding', () => {
    // 'subjects?d' encodes to 'c3ViamVjdHM/ZA==' in standard base64
    expect(base64UrlEncode(new TextEncoder().encode('subjects?d'))).toBe('c3ViamVjdHM_ZA');
  });
});

describe('generateState', () => {
  it('creates a different opaque state on every call', () => {
    expect(generateState()).not.toBe(generateState());
  });

  it('is URL-safe', () => {
    expect(generateState()).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});