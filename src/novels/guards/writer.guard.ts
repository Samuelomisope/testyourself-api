import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WriterGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.sub },
    });

    if (!user?.isWriter) {
      throw new ForbiddenException('Become a writer first to do this.');
    }
    req.dbUser = user;
    return true;
  }
}