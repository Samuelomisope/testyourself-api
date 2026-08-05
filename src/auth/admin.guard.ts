import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

const ADMIN_EMAILS = ['omisope34@gmail.com'];

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // set by JwtAuthGuard, which must run before this guard

    if (!user || !ADMIN_EMAILS.includes(user.email)) {
      throw new ForbiddenException('Admin access only');
    }
    return true;
  }
}
