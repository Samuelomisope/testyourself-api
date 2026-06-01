import { Module } from '@nestjs/common';
import { StudyMaterialService } from './study-material.service';
import { StudyMaterialController } from './study-material.controller';
import { AuthModule } from '../auth/auth.module';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Module({
  imports: [
    AuthModule,
   MulterModule.register({ 
  storage: memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  }
}),
  ],
  controllers: [StudyMaterialController],
  providers: [StudyMaterialService],
  exports: [StudyMaterialService],
})
export class StudyMaterialModule {}