/** Initials for the header avatar, from the ID token's claims. */
export function avatarInitials(idToken: string): string {
  const payload = idToken.split('.')[1];
  if (!payload) return 'G';
  try {
    // base64url → bytes → UTF-8 (atob alone is Latin-1 and mangles 'José').
    const bytes = Uint8Array.from(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as {
      name?: string;
      email?: string;
    };
    const source = claims.name ?? claims.email;
    if (!source) return 'G';
    const words = source.split(/[\s.]+/).filter(Boolean);
    return words
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('');
  } catch {
    return 'G';
  }
}