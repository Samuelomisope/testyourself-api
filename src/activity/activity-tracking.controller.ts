import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ActivityTrackingService, EventInput } from './activity-tracking.service';
import { FeatureVisitService } from './feature-visit.service';

@Controller('activity')
@UseGuards(JwtAuthGuard)
export class ActivityTrackingController {
  constructor(private readonly activity: ActivityTrackingService, private readonly visits: FeatureVisitService) {}

  @Post('events')
  ingest(@CurrentUser() user: AuthUser, @Body() body: { events: EventInput[] }) {
    return this.activity.ingest(user.sub, body.events);
  }

  /** The app reports which section the person opened (the section name only). */
  @Post('visit')
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async visit(@CurrentUser() user: AuthUser, @Body() body: { feature?: unknown }) {
    await this.visits.record(user.sub, body?.feature);
  }
}
