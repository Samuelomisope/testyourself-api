import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getRecentActivity(uid: string, type?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: uid } });
    if (!user) return [];
    return this.prisma.activityLog.findMany({
      where: { userId: user.id, ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async searchUsers(q: string) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { chatSnapUsername: { contains: q, mode: 'insensitive' } },
        ],
        isBanned: false,
      },
      select: { id: true, displayName: true, email: true, photoURL: true, chatSnapUsername: true },
      take: 20,
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { university: true },
    });
  }

  async updateProfile(uid: string, data: {
    displayName?: string;
    photoURL?: string;
    bio?: string;
    faculty?: string;
    department?: string;
    universityId?: string;
    chatSnapUsername?: string;
    chatWallpaper?: string;
  }) {
    return this.prisma.user.update({
      where: { id: uid },
      data,
      include: { university: true },
    });
  }

  async getUserStats(uid: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: uid },
    });
    if (!user) return null;

    const [files, products, messages, leaderboard] = await Promise.all([
      this.prisma.studyMaterial.count({ where: { userId: user.id } }),
      this.prisma.marketplaceItem.count({ where: { userId: user.id } }),
      this.prisma.message.count({ where: { senderId: user.id } }),
      this.prisma.leaderboardEntry.findUnique({ where: { userId: user.id } }),
    ]);

    return {
      files,
      products,
      messages,
      streak: user.streakCount,
      leaderboardScore: leaderboard?.score || 0,
    };
  }

  async logActivity(uid: string, type: string, description: string, href?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: uid } });
    if (!user) return;
    return this.prisma.activityLog.create({
      data: { userId: user.id, type, description, href },
    });
  }
}