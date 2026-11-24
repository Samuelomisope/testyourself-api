jest.mock('@prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error { code: string; constructor(m: string, o: { code: string }) { super(m); this.code = o.code; } } },
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { Prisma } from '@prisma/client';
import { BillingService } from './billing.service';
import { premiumReceiptEmail } from '../email/email-templates';

const REF = 'unilib_' + 'a'.repeat(32);
const ENV = { PAYMENTS_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test', PAYSTACK_PLAN_CODE: 'PLN_x', PAYSTACK_CALLBACK_URL: 'https://unilib.com.ng/premium' };

function paystack(amount: number, overrides: Record<string, unknown> = {}) {
  return { ok: true, json: async () => ({ status: true, data: { status: 'success', reference: REF, amount, currency: 'NGN', plan: 'PLN_x', paid_at: '2026-11-24T10:00:00.000Z', customer: { email: 'ada@x.com' }, metadata: { userId: 'u1' }, ...overrides } }) };
}

function build(createError?: unknown) {
  const db: any = {
    user: { findUnique: jest.fn(async (args: any) => (args.select?.premiumUntil ? { premiumUntil: null } : { id: 'u1', email: 'ada@x.com', displayName: 'Ada Obi' })), update: jest.fn() },
    premiumPayment: { create: jest.fn(async () => { if (createError) throw createError; }), findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(db)),
  };
  const email = { sendPremiumReceipt: jest.fn(async () => undefined) };
  return { db, email, service: new BillingService(db, email as any) };
}

describe('premium receipts and price', () => {
  const saved = { ...process.env };
  beforeEach(() => { Object.assign(process.env, ENV); delete process.env.PREMIUM_PRICE_NGN; });
  afterEach(() => { process.env = { ...saved }; jest.restoreAllMocks(); });

  it('sends one receipt for a newly verified payment', async () => {
    global.fetch = jest.fn(async () => paystack(200_000)) as any;
    const { service, email } = build();
    expect(await service.verifyCheckout('u1', REF)).toMatchObject({ verified: true });
    expect(email.sendPremiumReceipt).toHaveBeenCalledTimes(1);
    const [to, input] = email.sendPremiumReceipt.mock.calls[0] as any[];
    expect(to).toBe('ada@x.com');
    expect(input).toMatchObject({ amount: 2000, currency: 'NGN', reference: REF, displayName: 'Ada Obi' });
    expect(input.premiumUntil.toISOString()).toBe('2026-12-24T10:00:00.000Z');
  });

  it('does not send a second receipt for a payment that was already recorded', async () => {
    global.fetch = jest.fn(async () => paystack(200_000)) as any;
    const { service, email } = build(new (Prisma as any).PrismaClientKnownRequestError('dup', { code: 'P2002' }));
    expect(await service.verifyCheckout('u1', REF)).toMatchObject({ verified: true });
    expect(email.sendPremiumReceipt).not.toHaveBeenCalled();
  });

  it('still grants Premium when the receipt email fails', async () => {
    global.fetch = jest.fn(async () => paystack(200_000)) as any;
    const { service, email, db } = build();
    email.sendPremiumReceipt.mockRejectedValue(new Error('resend down'));
    expect(await service.verifyCheckout('u1', REF)).toMatchObject({ verified: true });
    expect(db.user.update).toHaveBeenCalled();
  });

  it('sends nothing for an unverified or mismatched payment', async () => {
    global.fetch = jest.fn(async () => paystack(200_000, { status: 'failed' })) as any;
    const { service, email, db } = build();
    expect(await service.verifyCheckout('u1', REF)).toMatchObject({ verified: false });
    expect(email.sendPremiumReceipt).not.toHaveBeenCalled();
    expect(db.premiumPayment.create).not.toHaveBeenCalled();
  });

  it('lists only the user\'s payments, newest first, in naira', async () => {
    const { service, db } = build();
    db.premiumPayment.findMany.mockResolvedValue([{ reference: 'r1', amount: 200_000, currency: 'NGN', paidAt: new Date('2026-11-24') }]);
    const result = await service.getPayments('u1');
    expect(db.premiumPayment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' }, orderBy: { paidAt: 'desc' } }));
    expect(result.payments[0]).toMatchObject({ reference: 'r1', amount: 2000, currency: 'NGN' });
    expect(result.payments[0]).not.toHaveProperty('userId');
  });

  it('uses PREMIUM_PRICE_NGN for the shown price and the accepted amount', async () => {
    process.env.PREMIUM_PRICE_NGN = '3000';
    const { service, db } = build();
    db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
    expect((await service.getStatus('u1')).price).toBe(3000);
    global.fetch = jest.fn(async () => paystack(200_000)) as any;
    expect(await service.verifyCheckout('u1', REF)).toMatchObject({ verified: false });
  });

  it('falls back to 2000 when PREMIUM_PRICE_NGN is not a positive whole number', async () => {
    for (const bad of ['abc', '0', '-5', '1500.5', '']) {
      process.env.PREMIUM_PRICE_NGN = bad;
      const { service, db } = build();
      db.user.findUnique.mockResolvedValue({ isPremium: false, premiumUntil: null });
      expect((await service.getStatus('u1')).price).toBe(2000);
    }
  });
});

describe('premiumReceiptEmail', () => {
  it('shows amount, dates and reference and escapes names', () => {
    const mail = premiumReceiptEmail({ displayName: '<b>Ada</b> Obi', amount: 2000, currency: 'NGN', reference: REF, paidAt: new Date('2026-11-24T10:00:00Z'), premiumUntil: new Date('2026-12-24T10:00:00Z') });
    expect(mail.subject).toContain('receipt');
    for (const part of ['NGN 2,000', '24 November 2026', '24 December 2026', REF]) { expect(mail.html).toContain(part); expect(mail.text).toContain(part); }
    expect(mail.html).not.toContain('<b>Ada</b>');
  });
});
