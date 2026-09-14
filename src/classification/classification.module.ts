import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClassificationController } from './classification.controller';
import { ClassificationService } from './services/classification.service';
import { ClassificationRulesService } from './services/classification-rules.service';
import { DuplicateDetectionService } from './services/duplicate-detection.service';
import { UploadModule } from '../upload/upload.module'; // TODO(Samuel): confirm this is the actual module name/path that exports UploadService

@Module({
  imports: [PrismaModule, UploadModule],
  controllers: [ClassificationController],
  providers: [ClassificationService, ClassificationRulesService, DuplicateDetectionService],
  exports: [ClassificationService, ClassificationRulesService, DuplicateDetectionService],
})
export class ClassificationModule {}