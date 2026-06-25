// announcement/announcement.module.ts
import { Module } from '@nestjs/common';
import { AnnouncementController } from './announcement.controller';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [EmailModule, PrismaModule],
  controllers: [AnnouncementController],
})
export class AnnouncementModule {}
