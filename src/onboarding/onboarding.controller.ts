import { Controller, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('seen')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listSeen(@CurrentUser() user: AuthUser) { return this.onboarding.listSeen(user.sub); }

  @Put('seen/:key')
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async markSeen(@CurrentUser() user: AuthUser, @Param('key') key: string) { await this.onboarding.markSeen(user.sub, key); }
}
