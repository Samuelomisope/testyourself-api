import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import { Throttle } from '@nestjs/throttler';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Get('status')
  getStatus(@CurrentUser() user: AuthUser) {
    return this.billingService.getStatus(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('checkout')
  createCheckout(@CurrentUser() user: AuthUser) {
    return this.billingService.createCheckout(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify')
  verifyCheckout(@CurrentUser() user: AuthUser, @Body('reference') reference: string) {
    return this.billingService.verifyCheckout(user.sub, reference);
  }

  @Post('paystack/webhook')
  async handlePaystackWebhook(
    @Req() req: RawBodyRequest,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new ServiceUnavailableException('Payments are not configured.');
    if (!signature || !req.rawBody || !this.billingService.isValidWebhook(req.rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid payment webhook signature.');
    }

    await this.billingService.handleWebhook(req.body);
    return { received: true };
  }
}
