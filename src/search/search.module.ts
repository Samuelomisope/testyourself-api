import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProviderModule } from '../provider/provider.module';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';

@Module({
  imports: [AuthModule, PrismaModule, ProviderModule],
  controllers: [RagController],
  providers: [RagService],
})
export class SearchModule {}
