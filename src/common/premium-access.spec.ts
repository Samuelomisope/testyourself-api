import { hasPaidPremium, hasPremiumAccess, isAdminAccount } from './premium-access';

describe('premium access', () => {
  const saved = process.env.ADMIN_EMAILS;
  afterEach(() => { if (saved === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = saved; });
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it('gives a paid, unexpired plan Premium', () => {
    expect(hasPremiumAccess({ isPremium: true, premiumUntil: future, role: 'STUDENT' })).toBe(true);
    expect(hasPaidPremium({ isPremium: true, premiumUntil: null })).toBe(true);
  });

  it('does not give an expired or unpaid student Premium', () => {
    expect(hasPremiumAccess({ isPremium: true, premiumUntil: past, role: 'STUDENT', email: 'a@x.com' })).toBe(false);
    expect(hasPremiumAccess({ isPremium: false, role: 'STUDENT' })).toBe(false);
    expect(hasPremiumAccess(null)).toBe(false);
    expect(hasPremiumAccess(undefined)).toBe(false);
  });

  it('gives ADMIN and SUPER_ADMIN roles Premium even with no payment', () => {
    expect(hasPremiumAccess({ isPremium: false, role: 'ADMIN' })).toBe(true);
    expect(hasPremiumAccess({ isPremium: false, role: 'SUPER_ADMIN' })).toBe(true);
    expect(hasPaidPremium({ isPremium: false, role: 'ADMIN' })).toBe(false);
  });

  it('gives an email in ADMIN_EMAILS Premium, ignoring case and spaces', () => {
    process.env.ADMIN_EMAILS = ' Boss@Unilib.com.ng , other@x.com ';
    expect(hasPremiumAccess({ isPremium: false, role: 'STUDENT', email: 'boss@unilib.com.ng' })).toBe(true);
    expect(isAdminAccount({ email: 'BOSS@unilib.com.ng' })).toBe(true);
    expect(isAdminAccount({ email: 'stranger@x.com' })).toBe(false);
  });

  it('never treats a missing email as an admin when ADMIN_EMAILS is empty', () => {
    process.env.ADMIN_EMAILS = '';
    expect(isAdminAccount({ role: 'STUDENT', email: '' })).toBe(false);
    expect(isAdminAccount({ role: 'STUDENT' })).toBe(false);
  });
});
