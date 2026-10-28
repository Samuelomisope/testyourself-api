import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ActivityTrackingService, EventInput } from './activity-tracking.service';

@Controller('activity')
@UseGuards(JwtAuthGuard)
export class ActivityTrackingController {
  constructor(private readonly activity: ActivityTrackingService) {}

  @Post('events')
  ingest(@CurrentUser() user: AuthUser, @Body() body: { events: EventInput[] }) {
    return this.activity.ingest(user.sub, body.events);
  }
}
