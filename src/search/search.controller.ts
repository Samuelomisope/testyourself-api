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
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @CurrentUser() currentUser: AuthUser,
  ) {
    if (!q || q.trim().length < 2) return { materials: [], users: [], marketplace: [], universities: [] };

   const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * take;

    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.sub },
    });

     const [materials, users, marketplace, universities] = await Promise.all([
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
         take,
        skip,
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
       take,
        skip,
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
       take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { displayName: true, photoURL: true } },
        },
      }).catch(() => []),

       this.prisma.university.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { shortName: { contains: q, mode: 'insensitive' } },
          ],
        },
        take,
        skip,
        include: { _count: { select: { users: true } } },
      }).catch(() => []),
    ]);

    return { materials, users, marketplace, universities };
  }
}
