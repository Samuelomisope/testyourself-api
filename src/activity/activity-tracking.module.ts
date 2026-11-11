import { Module } from '@nestjs/common';
import { ActivityTrackingService } from './activity-tracking.service';
import { ActivityTrackingController } from './activity-tracking.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  controllers: [ActivityTrackingController],
  imports: [NotificationsModule],
  providers: [ActivityTrackingService],
  exports: [ActivityTrackingService],
})
export class ActivityTrackingModule {}
