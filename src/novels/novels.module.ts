import { Module } from '@nestjs/common';
import { NovelsController } from './novels.controller';
import { NovelsService } from './novels.service';
import { WriterGuard } from './guards/writer.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NovelsController],
  providers: [NovelsService, WriterGuard],
})
export class NovelsModule {}