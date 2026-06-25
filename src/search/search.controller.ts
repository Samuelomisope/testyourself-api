import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async globalSearch(
    @Query('q') q: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    if (!q || q.trim().length < 2) return { materials: [], users: [], products: [] };

    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.sub },
    });

    const [materials, users, marketplace] = await Promise.all([
      // Study materials — public + own private
      this.prisma.studyMaterial.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { faculty: { contains: q, mode: 'insensitive' } },
          ],
          AND: [{ OR: [{ isPublic: true }, { userId: user?.id }] }],
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { displayName: true, photoURL: true } },
          university: { select: { name: true, shortName: true } },
        },
      }),

      // Users
      this.prisma.user.findMany({
        where: {
          OR: [
            { displayName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: { id: true, displayName: true, email: true, photoURL: true },
      }),

      // Marketplace products
      this.prisma.marketplaceItem.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
            
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { displayName: true, photoURL: true } },
        },
      }).catch(() => []),
    ]);

    return { materials, users, marketplace };
  }
}
