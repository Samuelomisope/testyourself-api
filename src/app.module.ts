import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { UniversitiesModule } from './universities/universities.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StudyMaterialModule } from './study-material/study-material.module';
import { SearchController } from './search/search.controller';
import { PrismaService } from './prisma/prisma.service';
import { AdminModule } from './admin/admin.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { UploadModule } from './upload/upload.module';
import { ChatModule } from './chat/chat.module';
import { AiModule } from './ai/ai.module';
import { FeedbackModule } from './feedback/feedback.module';
import { AnnouncementModule } from './announcement/announcement.module';
import { FlashcardModule } from './flashcard/flashcard.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SignedUrlInterceptor } from './common/signed-url.interceptor';
import { NovelsModule } from './novels/novels.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000, // 1 minute window
        limit: 100,  // generous global default; tighter limits set per-endpoint below
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    UniversitiesModule,
    StudyMaterialModule,
    AdminModule,
    MarketplaceModule,
    UploadModule,
    ChatModule,
    AiModule,
    FeedbackModule,
    AnnouncementModule,
    FlashcardModule,
    NovelsModule,
  ],
  controllers: [SearchController, AppController],
  providers: [PrismaService,
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: SignedUrlInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ], // if not already global
})
export class AppModule {}