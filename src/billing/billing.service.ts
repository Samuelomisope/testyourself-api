import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const PREMIUM_AMOUNT_KOBO = 200_000;
const PREMIUM_CURRENCY = 'NGN';
const PAYSTACK_API = 'https://api.paystack.co';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getConfiguration() {
    if (process.env.PAYMENTS_ENABLED !== 'true') {
      throw new ServiceUnavailableException('Premium checkout is not enabled yet.');
    }
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const planCode = process.env.PAYSTACK_PLAN_CODE;
    const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;
    if (!secretKey || !planCode || !callbackUrl) {
      throw new ServiceUnavailableException('Premium checkout is not configured.');
    }
    let callback: URL;
    try {
      callback = new URL(callbackUrl);
    } catch {
      throw new ServiceUnavailableException('Premium checkout callback URL is invalid.');
    }
    if (callback.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('Premium checkout callback URL must use HTTPS.');
    }
    return { secretKey, planCode, callbackUrl: callback.toString() };
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isPremium: true, premiumUntil: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    const active = user.isPremium && (!user.premiumUntil || user.premiumUntil > new Date());
    return {
      isPremium: active,
      premiumUntil: active ? user.premiumUntil : null,
      plan: 'monthly',
      price: PREMIUM_AMOUNT_KOBO / 100,
      currency: PREMIUM_CURRENCY,
      checkoutAvailable: process.env.PAYMENTS_ENABLED === 'true' &&
        Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PLAN_CODE && process.env.PAYSTACK_CALLBACK_URL),
    };
  }

  async createCheckout(userId: string) {
    const { secretKey, planCode, callbackUrl } = this.getConfiguration();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isBanned: true },
    });
    if (!user || user.isBanned) throw new NotFoundException('User not found.');

    const reference = `unilib_${randomUUID().replace(/-/g, '')}`;
    const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        plan: planCode,
        currency: PREMIUM_CURRENCY,
        reference,
        callback_url: callbackUrl,
        metadata: { userId: user.id, product: 'unilib_premium_monthly' },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((error: Error) => {
      this.logger.error(`Paystack checkout initialization failed: ${error.message}`);
      throw new BadGatewayException('Unable to start checkout. Please try again.');
    });

    const result = await response.json().catch(() => null) as any;
    if (!response.ok || !result?.status || !result?.data?.authorization_url) {
      this.logger.error(`Paystack checkout initialization returned HTTP ${response.status}.`);
      throw new BadGatewayException('Unable to start checkout. Please try again.');
    }
    return {
      authorizationUrl: result.data.authorization_url as string,
      reference: result.data.reference as string,
    };
  }

  async verifyCheckout(userId: string, reference: string) {
    if (typeof reference !== 'string' || !/^unilib_[a-f0-9]{32}$/.test(reference)) {
      throw new NotFoundException('Payment reference not found.');
    }
    const applied = await this.verifyAndApply(reference, userId);
    return { verified: applied, ...(await this.getStatus(userId)) };
  }

  isValidWebhook(rawBody: Buffer, signature: string, secret: string) {
    const expected = createHmac('sha512', secret).update(rawBody).digest();
    let received: Buffer;
    try {
      received = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  async handleWebhook(event: any) {
    if (!event || typeof event.event !== 'string') return;
    if (event.event !== 'charge.success' || !event.data?.reference) return;

    const reference = String(event.data.reference);
    await this.verifyAndApply(reference);
  }

  private async verifyAndApply(reference: string, expectedUserId?: string) {
    const { secretKey, planCode } = this.getConfiguration();
    const response = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(10_000),
    }).catch((error: Error) => {
      this.logger.error(`Paystack verification request failed: ${error.message}`);
      throw new BadGatewayException('Unable to verify payment.');
    });
    const result = await response.json().catch(() => null) as any;
    const payment = result?.data;
    const verifiedPlan = typeof payment?.plan === 'string' ? payment.plan : payment?.plan?.plan_code;
    if (!response.ok || !result?.status || payment?.status !== 'success' ||
        payment?.reference !== reference || payment?.amount !== PREMIUM_AMOUNT_KOBO ||
        payment?.currency !== PREMIUM_CURRENCY || verifiedPlan !== planCode) {
      this.logger.warn(`Ignoring unverified or mismatched Paystack payment ${reference}.`);
      return false;
    }

    const email = String(payment?.customer?.email ?? '').trim().toLowerCase();
    if (!email) return false;
    const metadata = typeof payment?.metadata === 'string'
      ? this.parseMetadata(payment.metadata)
      : payment?.metadata;
    const metadataUserId = typeof metadata?.userId === 'string' ? metadata.userId : undefined;
    let user = metadataUserId
      ? await this.prisma.user.findUnique({ where: { id: metadataUserId }, select: { id: true, email: true } })
      : null;
    if (expectedUserId && metadataUserId !== expectedUserId) {
      this.logger.warn(`Payment verification user did not match reference ${reference}.`);
      return false;
    }
    if (user && user.email.toLowerCase() !== email) {
      this.logger.warn(`Ignoring Paystack payment with mismatched user email for ${reference}.`);
      return false;
    }
    if (!user) {
      // Recurring charges may not repeat transaction metadata. Only renew a user
      // whose account has a previously verified payment for this exact plan.
      const existingPayment = await this.prisma.premiumPayment.findFirst({
        where: { planCode, user: { email } },
        select: { userId: true },
        orderBy: { paidAt: 'desc' },
      });
      if (!existingPayment) {
        this.logger.warn(`No verified UniLib account is linked to Paystack payment ${reference}.`);
        return false;
      }
      user = await this.prisma.user.findUnique({ where: { id: existingPayment.userId }, select: { id: true, email: true } });
    }
    if (!user || user.email.toLowerCase() !== email || (expectedUserId && user.id !== expectedUserId)) return false;

    const paidAt = payment.paid_at ? new Date(payment.paid_at) : new Date();
    if (Number.isNaN(paidAt.getTime())) return false;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.premiumPayment.create({
          data: {
            userId: user!.id,
            reference,
            planCode,
            amount: payment.amount,
            currency: payment.currency,
            paidAt,
          },
        });
        const current = await tx.user.findUnique({
          where: { id: user!.id },
          select: { premiumUntil: true },
        });
        if (!current) throw new NotFoundException('User not found.');
        const start = current.premiumUntil && current.premiumUntil > paidAt
          ? current.premiumUntil
          : paidAt;
        await tx.user.update({
          where: { id: user!.id },
          data: { isPremium: true, premiumUntil: addOneCalendarMonth(start) },
        });
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return true;
      throw error;
    }
  }

  private parseMetadata(value: string): any {
    try { return JSON.parse(value); } catch { return null; }
  }
}

function addOneCalendarMonth(date: Date) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}
