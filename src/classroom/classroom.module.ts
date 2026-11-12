import { Module } from '@nestjs/common';
import { ClassificationModule } from '../classification/classification.module';
import { ProviderModule } from '../provider/provider.module';
import { UploadModule } from '../upload/upload.module';
import { ClassroomController } from './classroom.controller';
import { ClassroomService } from './classroom.service';

@Module({
  imports: [ProviderModule, UploadModule, ClassificationModule],
  controllers: [ClassroomController],
  providers: [ClassroomService],
  exports: [ClassroomService],
})
export class ClassroomModule {}
