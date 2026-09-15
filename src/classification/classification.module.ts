import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClassificationController } from './classification.controller';
import { ClassificationService } from './services/classification.service';
import { ClassificationRulesService } from './services/classification-rules.service';
import { DuplicateDetectionService } from './services/duplicate-detection.service';
import { TextExtractionService } from './services/text-extraction.service';
import { UploadModule } from '../upload/upload.module';
import { ProviderModule } from '../provider/provider.module';

@Module({
  imports: [PrismaModule, UploadModule, ProviderModule],
  controllers: [ClassificationController],
  providers: [
    ClassificationService,
    ClassificationRulesService,
    DuplicateDetectionService,
    TextExtractionService,
  ],
  exports: [ClassificationService, ClassificationRulesService, DuplicateDetectionService, TextExtractionService],
})
export class ClassificationModule {}


