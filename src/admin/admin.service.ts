import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [users, materials, products, universities, reports ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.studyMaterial.count(),
      this.prisma.marketplaceItem.count(),
      this.prisma.university.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);
   const topUniversities = await this.prisma.university.findMany({
    include: {
      _count: { select: { users: true, studyMaterials: true } },
    },
    orderBy: { users: { _count: 'desc' } },
    take: 5,
  });

  return { users, materials, products, universities, pendingReports: reports, topUniversities };
}

  

  async getAllUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        university: { select: { name: true, shortName: true } },
      },
    });
  }

  async deleteUser(id: string) {
    await this.prisma.studyMaterial.deleteMany({ where: { userId: id } });
    await this.prisma.marketplaceItem.deleteMany({ where: { userId: id } });
    return this.prisma.user.delete({ where: { id } });
  }

  async getAllMaterials() {
    return this.prisma.studyMaterial.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { displayName: true, email: true } },
        university: { select: { name: true, shortName: true } },
      },
    });
  }

  async deleteMaterial(id: string) {
    return this.prisma.studyMaterial.delete({ where: { id } });
  }

  async getAllProducts() {
    return this.prisma.marketplaceItem.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { displayName: true, email: true } },
      },
    });
  }

  async deleteProduct(id: string) {
    return this.prisma.marketplaceItem.delete({ where: { id } });
  }

  async deleteUniversity(id: string) {
    return this.prisma.university.delete({ where: { id } });
  }

  async getAllReports() {
    try {
      return await this.prisma.report.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          reportedBy: { select: { displayName: true, email: true } },
          reportedUser: { select: { displayName: true, email: true } },
        },
      });
    } catch {
      return [];
    }
  }

  async resolveReport(id: string) {
    return this.prisma.report.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });
  }
  async toggleBanUser(id: string) {
  const user = await this.prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundException(`User ${id} not found`);
  return this.prisma.user.update({
    where: { id },
    data: { isBanned: !user.isBanned },
  });
}
}