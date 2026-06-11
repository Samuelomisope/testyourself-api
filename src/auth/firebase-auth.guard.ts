import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);

      if (!decodedToken.email_verified) {
        throw new UnauthorizedException('Email not verified');
      }

      request.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        name: decodedToken.name,
        picture: decodedToken.picture,
      };

      // update lastActiveAt in the background
      this.prisma.user.update({
        where: { firebaseUid: decodedToken.uid },
        data: { lastActiveAt: new Date() },
      }).catch(() => {}); // silent fail — don't block the request

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}