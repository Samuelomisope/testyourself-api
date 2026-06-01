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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    UniversitiesModule,
    StudyMaterialModule,
    AdminModule,
  ],
  controllers: [SearchController],
  providers: [PrismaService], // if not already global
})
export class AppModule implements OnModuleInit {
  onModuleInit() {
    const serviceAccountPath = path.resolve('firebase-service-account.json');
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized');
    }
  }
}