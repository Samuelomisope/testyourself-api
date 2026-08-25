import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { StudyMaterialModule } from '../study-material/study-material.module';

@Module({
  imports: [AuthModule, PrismaModule, EmailModule, StudyMaterialModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}