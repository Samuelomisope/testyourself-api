import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProviderModule } from '../provider/provider.module';

@Module({
  imports: [AuthModule, PrismaModule, ProviderModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}