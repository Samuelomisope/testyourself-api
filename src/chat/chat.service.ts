import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // ── Helper ────────────────────────────────────────────────────────
  private async getDbUser(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ── Direct Message Room ───────────────────────────────────────────
  async getOrCreateDM(firebaseUid: string, targetUserId: string) {
    const currentUser = await this.getDbUser(firebaseUid);

    const existing = await this.prisma.chatRoom.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: currentUser.id } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, displayName: true, photoURL: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { displayName: true } } },
        },
      },
    });

    if (existing) return existing;

    return this.prisma.chatRoom.create({
      data: {
        isGroup: false,
        members: {
          create: [
            { userId: currentUser.id },
            { userId: targetUserId },
          ],
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, displayName: true, photoURL: true } },
          },
        },
        messages: true,
      },
    });
  }

  // ── Group Chat Room ───────────────────────────────────────────────
  async getOrCreateGroupRoom(universityId: string) {
    const existing = await this.prisma.chatRoom.findFirst({
      where: { isGroup: true, universityId },
    });
    if (existing) return existing;
    return this.prisma.chatRoom.create({
      data: { isGroup: true, universityId },
    });
  }

  async joinGroupRoom(firebaseUid: string, roomId: string) {
    const user = await this.getDbUser(firebaseUid);
    const existing = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (existing) return existing;
    return this.prisma.chatRoomMember.create({
      data: { userId: user.id, roomId },
    });
  }

  // ── Get My Rooms ──────────────────────────────────────────────────
  async getMyRooms(firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);
    return this.prisma.chatRoom.findMany({
      where: { members: { some: { userId: user.id } } },
      include: {
        members: {
          include: {
            user: { select: { id: true, displayName: true, photoURL: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { displayName: true } } },
        },
        university: { select: { shortName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get Messages ──────────────────────────────────────────────────
  async getMessages(roomId: string, firebaseUid: string, cursor?: string) {
    const user = await this.getDbUser(firebaseUid);
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this room');

    return this.prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        sender: { select: { id: true, displayName: true, photoURL: true } },
        replyTo: {
          include: {
            sender: { select: { displayName: true } },
          },
        },
        reactions: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  // ── Create Message ────────────────────────────────────────────────
  async createMessage(
    roomId: string,
    senderId: string,
    text: string,
    options?: { mediaUrl?: string; mediaType?: string; type?: string; replyToId?: string },
  ) {
    return this.prisma.message.create({
      data: {
        roomId,
        senderId,
        text,
        mediaUrl: options?.mediaUrl,
        mediaType: options?.mediaType,
        type: options?.type || 'text',
        replyToId: options?.replyToId,
      },
      include: {
        sender: { select: { id: true, displayName: true, photoURL: true } },
        replyTo: {
          include: { sender: { select: { displayName: true } } },
        },
        reactions: true,
      },
    });
  }

  // ── React to Message ──────────────────────────────────────────────
  async reactToMessage(firebaseUid: string, messageId: string, emoji: string) {
    const user = await this.getDbUser(firebaseUid);
    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId: { messageId, userId: user.id } },
    });

    if (existing) {
      if (existing.emoji === emoji) {
        // Remove reaction if same emoji
        return this.prisma.messageReaction.delete({
          where: { messageId_userId: { messageId, userId: user.id } },
        });
      }
      // Update reaction
      return this.prisma.messageReaction.update({
        where: { messageId_userId: { messageId, userId: user.id } },
        data: { emoji },
      });
    }

    return this.prisma.messageReaction.create({
      data: { messageId, userId: user.id, emoji },
    });
  }

  // ── Mark Messages as Read ─────────────────────────────────────────
  async markAsRead(roomId: string, firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);
    return this.prisma.message.updateMany({
      where: { roomId, isRead: false, senderId: { not: user.id } },
      data: { isRead: true },
    });
  }

  // ── Get Room by ID ────────────────────────────────────────────────
  async getRoomById(roomId: string) {
    return this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: {
            user: { select: { id: true, displayName: true, photoURL: true } },
          },
        },
        university: { select: { shortName: true, name: true } },
      },
    });
  }

  // ── Status ────────────────────────────────────────────────────────
  async createStatus(firebaseUid: string, data: { text?: string; mediaUrl?: string; type?: string }) {
    const user = await this.getDbUser(firebaseUid);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    return this.prisma.status.create({
      data: {
        userId: user.id,
        text: data.text,
        mediaUrl: data.mediaUrl,
        type: data.type || 'text',
        expiresAt,
      },
      include: {
        user: { select: { id: true, displayName: true, photoURL: true } },
      },
    });
  }

  async getStatuses(firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);
    return this.prisma.status.findMany({
      where: {
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { select: { id: true, displayName: true, photoURL: true } },
        views: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async viewStatus(firebaseUid: string, statusId: string) {
    const user = await this.getDbUser(firebaseUid);
    return this.prisma.statusView.upsert({
      where: { statusId_userId: { statusId, userId: user.id } },
      update: {},
      create: { statusId, userId: user.id },
    });
  }
}