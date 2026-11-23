import { JwtService } from '@nestjs/jwt';
import { BRAND } from './email-layout';

const PURPOSE = 'unsubscribe-reminders';

// A different signing secret from login tokens: this token must never be accepted as an access or refresh token.
const secret = () => {
  const base = process.env.JWT_SECRET;
  if (!base) throw new Error('JWT_SECRET is not set');
  return `${base}:unsubscribe-reminders`;
};

/** A signed, single-purpose token so the unsubscribe link works without logging in. */
export function signUnsubscribeToken(jwt: JwtService, userId: string): string {
  return jwt.sign({ sub: userId, purpose: PURPOSE }, { secret: secret(), expiresIn: '400d' });
}

/** Returns the user id, or null when the token is invalid, expired or made for something else. */
export function verifyUnsubscribeToken(jwt: JwtService, token: string): string | null {
  try {
    const payload = jwt.verify<{ sub?: string; purpose?: string }>(token, { secret: secret() });
    return payload.purpose === PURPOSE && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export const unsubscribeUrl = (token: string) => `${BRAND.url}/unsubscribe?token=${encodeURIComponent(token)}`;
