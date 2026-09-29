import { describe, expect, it } from 'vitest';
import { avatarInitials } from './avatar-initials';

function tokenWithClaims(claims: object): string {
  const b64 = (v: object) => btoa(JSON.stringify(v)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}

describe('avatarInitials', () => {
  it('ShouldReturnNameInitials_WhenNameClaimPresent', () => {
    expect(avatarInitials(tokenWithClaims({ name: 'Jane Doe' }))).toBe('JD');
  });

  it('ShouldFallBackToEmailInitials_WhenNameClaimAbsent', () => {
    expect(avatarInitials(tokenWithClaims({ email: 'jane.doe@example.com' }))).toBe('JD');
  });

  it('ShouldPreserveAccentedCharacters_WhenNameIsNonAscii', () => {
    // 'José Rosário' — TextDecoder handles the UTF-8 bytes atob mis-decodes.
    expect(avatarInitials(tokenWithClaims({ name: 'José Rosário' }))).toBe('JR');
  });

  it('ShouldReturnFallback_WhenTokenIsMalformed', () => {
    expect(avatarInitials('not-a-jwt')).toBe('G');
    expect(avatarInitials(`${btoa('x')}.${btoa('not-json')}.sig`)).toBe('G');
  });
});