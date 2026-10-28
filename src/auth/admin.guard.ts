import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // set by JwtAuthGuard, which must run before this guard

    const role = user?.role;
    const email = typeof user?.email === 'string' ? user.email.toLowerCase() : '';
    const allowedEmails = new Set((process.env.ADMIN_EMAILS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
    if (!user || (!['ADMIN', 'SUPER_ADMIN'].includes(role) && !allowedEmails.has(email))) {
      throw new ForbiddenException('Admin access only');
    }
    return true;
  }
}
