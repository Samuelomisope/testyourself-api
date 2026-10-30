import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private readonly uploadService: UploadService) {}

async getRecentActivity(uid: string, type?: string, days = 7) {
    const user = await this.prisma.user.findUnique({ where: { id: uid } });
    if (!user) return [];
    const since = new Date();
    since.setDate(since.getDate() - days);
    return this.prisma.activityLog.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: since },
        ...(type ? { type } : {}),
      },
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
      select: { id: true, displayName: true, photoURL: true, chatSnapUsername: true },
      take: 20,
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { university: true },
    });
    if (!user) return null;
    return {
      ...user,
      isPremium: user.isPremium && (!user.premiumUntil || user.premiumUntil > new Date()),
    };
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
    if (data.photoURL !== undefined && data.photoURL !== null) {
      const value = data.photoURL.trim();
      if (this.uploadService.isStorageReference(value)) {
        if (!this.uploadService.isOwnedProfilePhoto(value, uid)) {
          throw new BadRequestException('Profile images must be uploaded to your own profile-pictures folder.');
        }
      } else {
        let url: URL;
        try { url = new URL(value); } catch { throw new BadRequestException('photoURL must be a valid HTTPS URL.'); }
        if (url.protocol !== 'https:') throw new BadRequestException('photoURL must use HTTPS.');
      }
      data.photoURL = value;
    }
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
