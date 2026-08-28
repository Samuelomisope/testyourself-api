import { Module } from '@nestjs/common';
import { UniversitiesService } from './universities.service';
import { UniversitiesController } from './universities.controller';
import { UniversityNewsController } from './university-news.controller';
import { UniversityNewsService } from './university-news.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [UniversitiesController, UniversityNewsController],
  providers: [UniversitiesService, UniversityNewsService],
  exports: [UniversitiesService, UniversityNewsService],
})
export class UniversitiesModule {}