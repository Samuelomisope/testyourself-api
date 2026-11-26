import { Module } from '@nestjs/common';
import { ActivityTrackingService } from './activity-tracking.service';
import { ActivityTrackingController } from './activity-tracking.controller';
import { FeatureVisitService } from './feature-visit.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  controllers: [ActivityTrackingController],
  imports: [NotificationsModule],
  providers: [ActivityTrackingService, FeatureVisitService],
  exports: [ActivityTrackingService],
})
export class ActivityTrackingModule {}
