import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

  async getStats() {
    const [users, materials, products, universities, reports, sellers, buyers, activeListings, soldListings] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.studyMaterial.count(),
      this.prisma.marketplaceItem.count(),
      this.prisma.university.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
      this.prisma.sellerProfile.count(),
      this.prisma.buyerProfile.count(),
      this.prisma.marketplaceItem.count({ where: { status: 'ACTIVE' } }),
      this.prisma.marketplaceItem.count({ where: { status: 'SOLD' } }),
    ]);

    const topUniversities = await this.prisma.university.findMany({
      include: {
        _count: { select: { users: true, studyMaterials: true } },
      },
      orderBy: { users: { _count: 'desc' } },
      take: 5,
    });

    return {
      users, materials, products, universities,
      pendingReports: reports,
      topUniversities,
      marketplace: { sellers, buyers, activeListings, soldListings },
    };
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
    await this.prisma.review.deleteMany({ where: { userId: id } });
    await this.prisma.sellerProfile.deleteMany({ where: { userId: id } });
    await this.prisma.buyerProfile.deleteMany({ where: { userId: id } });
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
        reviews: { select: { rating: true } },
      },
    });
  }

  async deleteProduct(id: string) {
    await this.prisma.review.deleteMany({ where: { itemId: id } });
    return this.prisma.marketplaceItem.delete({ where: { id } });
  }

  async getAllSellers() {
    return this.prisma.sellerProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, displayName: true, email: true, photoURL: true } },
      },
    });
  }

  async deleteSeller(id: string) {
    return this.prisma.sellerProfile.delete({ where: { id } });
  }

  async getAllReviews() {
    return this.prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { displayName: true, email: true } },
        item: { select: { title: true } },
      },
    });
  }

  async deleteReview(id: string) {
    return this.prisma.review.delete({ where: { id } });
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

  async notifyInactiveUsers() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const inactiveUsers = await this.prisma.user.findMany({
    where: { lastActiveAt: { lt: sevenDaysAgo }, isBanned: false },
    select: { email: true, displayName: true },
  });

  for (const user of inactiveUsers) {
    await this.email.sendReEngagementEmail(user.email, user.displayName);
  }

  return { sent: inactiveUsers.length };
}
}