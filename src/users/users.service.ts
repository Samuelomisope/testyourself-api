import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { FirebaseUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getRecentActivity(uid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: uid },
    });
    if (!user) return [];

    return this.prisma.activityLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
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

  async findOrCreate(firebaseUser: FirebaseUser) {
    let existing = await this.prisma.user.findUnique({
      where: { firebaseUid: firebaseUser.uid },
      include: { university: true },
    });

    if (!existing && firebaseUser.email) {
      existing = await this.prisma.user.findUnique({
        where: { email: firebaseUser.email },
        include: { university: true },
      });

      if (existing) {
        existing = await this.prisma.user.update({
          where: { email: firebaseUser.email },
          data: { firebaseUid: firebaseUser.uid },
          include: { university: true },
        });
      }
    }

    if (existing) {
      const now = new Date();
      const last = new Date(existing.lastActiveAt);
      const todayStr = now.toDateString();
      const lastStr = last.toDateString();

      if (todayStr === lastStr) {
        return this.prisma.user.update({
          where: { firebaseUid: firebaseUser.uid },
          data: {
            lastActiveAt: now,
            emailVerified: firebaseUser.emailVerified,
            photoURL: firebaseUser.picture || existing.photoURL,
            displayName: firebaseUser.name || existing.displayName,
          },
          include: { university: true },
        });
      }

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const newStreak = last.toDateString() === yesterday.toDateString()
        ? existing.streakCount + 1
        : 1;

      return this.prisma.user.update({
        where: { firebaseUid: firebaseUser.uid },
        data: {
          lastActiveAt: now,
          emailVerified: firebaseUser.emailVerified,
          photoURL: firebaseUser.picture || existing.photoURL,
          displayName: firebaseUser.name || existing.displayName,
          streakCount: newStreak,
        },
        include: { university: true },
      });
    }

    return this.prisma.user.create({
      data: {
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.name || firebaseUser.email.split('@')[0],
        photoURL: firebaseUser.picture || null,
        emailVerified: firebaseUser.emailVerified,
        streakCount: 1,
      },
      include: { university: true },
    });
  }

  async findByFirebaseUid(uid: string) {
    return this.prisma.user.findUnique({
      where: { firebaseUid: uid },
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
  }) {
    return this.prisma.user.update({
      where: { firebaseUid: uid },
      data,
      include: { university: true },
    });
  }

  async getUserStats(uid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid: uid },
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
}