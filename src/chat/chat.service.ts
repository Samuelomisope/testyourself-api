import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // ── Helper ────────────────────────────────────────────────────────
  private async getDbUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ── Direct Message Room ───────────────────────────────────────────
  async getOrCreateDM(firebaseUid: string, targetUserId: string) {
    const currentUser = await this.getDbUser(firebaseUid);

    return this.prisma.runAsUser(currentUser.id, async (tx) => {
      const existing = await tx.chatRoom.findFirst({
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

      return tx.chatRoom.create({
        data: {
          isGroup: false,
          members: {
            create: [{ userId: currentUser.id }, { userId: targetUserId }],
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
    });
  }

  // ── University Group Room ─────────────────────────────────────────
  // Not routed through runAsUser: ChatRoom has no member restricting group-room
  // lookup/creation by universityId, and this predates per-user scoping.
  async getOrCreateGroupRoom(universityId: string) {
    const existing = await this.prisma.chatRoom.findFirst({
      where: { isGroup: true, universityId },
    });
    if (existing) return existing;
    return this.prisma.chatRoom.create({
      data: { isGroup: true, universityId },
    });
  }

  // ── Create Custom Group ───────────────────────────────────────────
  async createCustomGroup(
    firebaseUid: string,
    name: string,
    memberIds: string[],
  ) {
    const creator = await this.getDbUser(firebaseUid);
    const allMemberIds = Array.from(new Set([creator.id, ...memberIds]));

    return this.prisma.runAsUser(creator.id, (tx) =>
      tx.chatRoom.create({
        data: {
          isGroup: true,
          name,
          members: {
            create: allMemberIds.map((userId) => ({ userId })),
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
      }),
    );
  }

  // ── Join Group Room ───────────────────────────────────────────────
  async joinGroupRoom(firebaseUid: string, roomId: string) {
    const user = await this.getDbUser(firebaseUid);

    return this.prisma.runAsUser(user.id, async (tx) => {
      const existing = await tx.chatRoomMember.findUnique({
        where: { userId_roomId: { userId: user.id, roomId } },
      });
      if (existing) return existing;
      return tx.chatRoomMember.create({
        data: { userId: user.id, roomId },
      });
    });
  }

  // ── Get My Rooms ──────────────────────────────────────────────────
  async getMyRooms(firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);

    return this.prisma.runAsUser(user.id, (tx) =>
      tx.chatRoom.findMany({
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
      }),
    );
  }

  // ── Get Messages ──────────────────────────────────────────────────
  async getMessages(roomId: string, firebaseUid: string, cursor?: string) {
    const user = await this.getDbUser(firebaseUid);
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this room');

    return this.prisma.runAsUser(user.id, (tx) =>
      tx.message.findMany({
        where: { roomId },
        orderBy: { createdAt: 'asc' },
        take: 50,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          sender: { select: { id: true, displayName: true, photoURL: true } },
          replyTo: { include: { sender: { select: { displayName: true } } } },
          reactions: {
            include: { user: { select: { id: true, displayName: true } } },
          },
        },
      }),
    );
  }

  // ── Search Messages ───────────────────────────────────────────────
  async searchMessages(roomId: string, firebaseUid: string, query: string) {
    const user = await this.getDbUser(firebaseUid);
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this room');

    return this.prisma.runAsUser(user.id, (tx) =>
      tx.message.findMany({
        where: {
          roomId,
          type: 'text',
          text: { contains: query, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          sender: { select: { id: true, displayName: true, photoURL: true } },
        },
      }),
    );
  }

  // ── Get Room Media ────────────────────────────────────────────────
  async getRoomMedia(roomId: string, firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this room');

    return this.prisma.runAsUser(user.id, (tx) =>
      tx.message.findMany({
        where: {
          roomId,
          type: { in: ['image', 'video', 'audio', 'file'] },
          mediaUrl: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          type: true,
          mediaUrl: true,
          mediaType: true,
          createdAt: true,
          sender: { select: { id: true, displayName: true } },
        },
      }),
    );
  }

  // ── Create Message ────────────────────────────────────────────────
  // Note: senderId is passed in directly (not resolved from a firebaseUid here),
  // so it's used as-is for both the write and the RLS session var. Confirm at the
  // call site that senderId is already the trusted, authenticated user's DB id.
  async createMessage(
    roomId: string,
    senderId: string,
    text: string,
    options?: {
      mediaUrl?: string;
      mediaType?: string;
      type?: 'text' | 'image' | 'video' | 'audio' | 'file';
      replyToId?: string;
    },
  ) {
    return this.prisma.runAsUser(senderId, (tx) =>
      tx.message.create({
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
      }),
    );
  }

  // ── React to Message ──────────────────────────────────────────────
  // Not routed through runAsUser: MessageReaction has no RLS policies yet
  // (table isn't in the RLS-enabled set). Revisit once that table gets policies.
 async reactToMessage(firebaseUid: string, messageId: string, emoji: string) {
  const user = await this.getDbUser(firebaseUid);

  return this.prisma.runAsUser(user.id, async (tx) => {
    const existing = await tx.messageReaction.findUnique({
      where: { messageId_userId: { messageId, userId: user.id } },
    });

    if (existing) {
      if (existing.emoji === emoji) {
        return tx.messageReaction.delete({
          where: { messageId_userId: { messageId, userId: user.id } },
        });
      }
      return tx.messageReaction.update({
        where: { messageId_userId: { messageId, userId: user.id } },
        data: { emoji },
      });
    }

    return tx.messageReaction.create({
      data: { messageId, userId: user.id, emoji },
    });
  });
}

  // ── Mark Messages as Read ─────────────────────────────────────────
  async markAsRead(roomId: string, firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);

    return this.prisma.runAsUser(user.id, (tx) =>
      tx.message.updateMany({
        where: { roomId, isRead: false, senderId: { not: user.id } },
        data: { isRead: true },
      }),
    );
  }

  // ── Get Room by ID ────────────────────────────────────────────────
  // Not routed through runAsUser: called without a firebaseUid in the current
  // signature, so there's no user to scope the session var to. If this needs
  // RLS protection, its signature needs to change to accept the caller's id.
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
  // Status/StatusView are not RLS-enabled yet — left as direct prisma calls.
  async createStatus(
    firebaseUid: string,
    data: {
      text?: string;
      mediaUrl?: string;
      mediaType?: string;
      type?: string;
      bgColor?: string;
    },
  ) {
    const user = await this.getDbUser(firebaseUid);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.prisma.status.create({
      data: {
        userId: user.id,
        text: data.text,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        type: data.type || 'text',
        bgColor: data.bgColor,
        expiresAt,
      },
      include: {
        user: { select: { id: true, displayName: true, photoURL: true } },
      },
    });
  }

  async getStatuses(firebaseUid: string) {
    await this.getDbUser(firebaseUid);
    return this.prisma.status.findMany({
      where: { expiresAt: { gt: new Date() } },
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
