/**
 * Who gets Premium features. A paid plan that has not ended, or an admin.
 * Admin means the same as AdminGuard: role ADMIN or SUPER_ADMIN, or an email listed in ADMIN_EMAILS.
 * Kept separate from AdminGuard on purpose: this only decides entitlements and never grants admin routes.
 */
export type PremiumSubject = {
  isPremium?: boolean | null;
  premiumUntil?: Date | null;
  role?: string | null;
  email?: string | null;
};

export function isAdminAccount(user: PremiumSubject | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!email) return false;
  return (process.env.ADMIN_EMAILS ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean).includes(email);
}

export function hasPaidPremium(user: PremiumSubject | null | undefined): boolean {
  return !!user?.isPremium && (!user.premiumUntil || user.premiumUntil > new Date());
}

export function hasPremiumAccess(user: PremiumSubject | null | undefined): boolean {
  return hasPaidPremium(user) || isAdminAccount(user);
}

/** Prisma select that carries everything hasPremiumAccess needs. */
export const PREMIUM_SELECT = { isPremium: true, premiumUntil: true, role: true, email: true } as const;
