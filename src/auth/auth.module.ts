import { Module } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { FirebaseStrategy } from './firebase.strategy';

@Module({
  providers: [FirebaseAuthGuard, FirebaseStrategy],
  exports: [FirebaseAuthGuard],
})
export class AuthModule {}