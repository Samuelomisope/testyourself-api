import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UniversitiesModule } from './universities/universities.module';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
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
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { SchoolModule } from './school/school.module';
import { DepartmentModule } from './department/department.module';
import { ProgramModule } from './program/program.module';

@Module({
 imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  ThrottlerModule.forRootAsync({
    useFactory: () => ({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: 100,
        },
      ],
     storage: new ThrottlerStorageRedisService(new Redis(process.env.REDIS_URL!)),
    }),
  }),
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
    RedisModule,
    SchoolModule,
    DepartmentModule,
    ProgramModule,
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
export class AppModule implements OnModuleInit {
 onModuleInit() {
  if (!admin.apps.length) {
    const serviceAccount = (process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : JSON.parse(fs.readFileSync(path.resolve('firebase-service-account.json'), 'utf8'))) as admin.ServiceAccount;

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized');
  }
}
}
