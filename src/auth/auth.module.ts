import { Module } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { FirebaseStrategy } from './firebase.strategy';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FirebaseAuthGuard, FirebaseStrategy],
  exports: [FirebaseAuthGuard],
})
export class AuthModule {}