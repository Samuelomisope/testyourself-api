import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProviderModule } from '../provider/provider.module';
import { UploadModule } from '../upload/upload.module';
import { StudyPlanCoachService } from './study-plan-coach.service';

@Module({
  imports: [AuthModule, PrismaModule, ProviderModule, UploadModule],
  controllers: [AiController],
  providers: [AiService, StudyPlanCoachService],
})
export class AiModule {}