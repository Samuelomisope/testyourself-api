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
import { AnnouncementController } from './announcement/announcement.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    AnnouncementController,
  ],
  controllers: [SearchController, AnnouncementController],
  providers: [PrismaService], // if not already global
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
    console.log('✅ Firebase Admin initialized');
  }
}
}