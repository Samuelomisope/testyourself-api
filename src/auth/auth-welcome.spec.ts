jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('resend', () => ({ Resend: class {} }));
const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: class { verifyIdToken = verifyIdToken; } }));

import { AuthService } from './auth.service';

function build(existing: any) {
  const created = { id: 'u1', email: 'ada@x.com', displayName: 'Ada', isBanned: false };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn().mockResolvedValue(created), update: jest.fn() },
    refreshToken: { create: jest.fn() },
  };
  const jwt: any = { sign: jest.fn().mockReturnValue('t') };
  const email: any = { sendWelcomeEmail: jest.fn().mockResolvedValue(undefined) };
  const svc: any = new AuthService(prisma, jwt, email);
  svc.updateStreak = jest.fn().mockResolvedValue(undefined);
  svc.issueTokens = jest.fn().mockResolvedValue({ accessToken: 'a' });
  verifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'g1', email: 'ada@x.com', email_verified: true, name: 'Ada' }) });
  return { svc, email, prisma };
}

describe('welcome email on sign-in', () => {
  it('is sent once for a brand-new account', async () => {
    const { svc, email } = build(null);
    await svc.loginWithGoogle('id');
    expect(email.sendWelcomeEmail).toHaveBeenCalledWith('ada@x.com', 'Ada');
  });
  it('is not sent to a returning user', async () => {
    const { svc, email } = build({ id: 'u1', email: 'ada@x.com', isBanned: false });
    await svc.loginWithGoogle('id');
    expect(email.sendWelcomeEmail).not.toHaveBeenCalled();
  });
  it('a failing email never breaks sign-in', async () => {
    const { svc, email } = build(null);
    email.sendWelcomeEmail.mockRejectedValue(new Error('resend down'));
    await expect(svc.loginWithGoogle('id')).resolves.toEqual({ accessToken: 'a' });
  });
});
