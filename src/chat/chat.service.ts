import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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

async setUserOnline(userId: string, isOnline: boolean) {
  return this.prisma.user.update({
    where: { id: userId },
    data: { isOnline, lastActiveAt: new Date() },
  });
}
  // ── Direct Message Room ───────────────────────────────────────────
  async getOrCreateDM(firebaseUid: string, targetUserId: string) {
    const currentUser = await this.getDbUser(firebaseUid);
    if (!targetUserId || targetUserId === currentUser.id) {
      throw new ForbiddenException('Choose another user to start a direct message.');
    }
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, isBanned: true } });
    if (!targetUser || targetUser.isBanned) throw new NotFoundException('User not found');

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

  // ── University Group Room ─────────────────────────────────────────
  async getOrCreateGroupRoom(firebaseUid: string, universityId: string) {
    const user = await this.getDbUser(firebaseUid);
    if (!user.universityId || user.universityId !== universityId) {
      throw new ForbiddenException('You can only join your university group.');
    }
    const existing = await this.prisma.chatRoom.findFirst({
      where: { isGroup: true, universityId },
    });
    const room = existing ?? await this.prisma.chatRoom.create({ data: { isGroup: true, universityId } });
    await this.prisma.chatRoomMember.upsert({
      where: { userId_roomId: { userId: user.id, roomId: room.id } },
      create: { userId: user.id, roomId: room.id },
      update: {},
    });
    return room;
  }

  // ── Create Custom Group ───────────────────────────────────────────
  // NEW: lets users create a named group with specific members
  async createCustomGroup(
    firebaseUid: string,
    name: string,
    memberIds: string[],
  ) {
    const creator = await this.getDbUser(firebaseUid);
    if (!name?.trim() || name.length > 100 || !Array.isArray(memberIds) || memberIds.length > 99) {
      throw new ForbiddenException('Invalid group details.');
    }

    // Always include the creator
    const allMemberIds = Array.from(new Set([creator.id, ...memberIds]));
    const members = await this.prisma.user.findMany({
      where: { id: { in: allMemberIds }, isBanned: false },
      select: { id: true },
    });
    if (members.length !== allMemberIds.length) throw new NotFoundException('One or more group members were not found.');

    return this.prisma.chatRoom.create({
      data: {
        isGroup: true,
        name: name.trim(),
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
        messages: [],
      },
    });
  }

  // ── Join Group Room ───────────────────────────────────────────────
  async joinGroupRoom(firebaseUid: string, roomId: string) {
    const user = await this.getDbUser(firebaseUid);
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (!room.isGroup || !room.universityId || room.universityId !== user.universityId) {
      throw new ForbiddenException('You cannot join this room.');
    }
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

  const rooms = await this.prisma.chatRoom.findMany({
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

  const roomsWithUnread = await Promise.all(
    rooms.map(async (room) => {
      const unreadCount = await this.prisma.message.count({
        where: {
          roomId: room.id,
          isRead: false,
          senderId: { not: user.id },
        },
      });
      return { ...room, unreadCount };
    }),
  );

  return roomsWithUnread;
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
          include: { sender: { select: { displayName: true } } },
        },
        reactions: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });
  }

  async assertRoomMember(roomId: string, userId: string): Promise<void> {
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId, roomId } }, select: { id: true },
    });
    if (!member) throw new ForbiddenException('Not a member of this room');
  }

  async getMessageRoomId(messageId: string): Promise<string> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: { roomId: true } });
    if (!message) throw new NotFoundException('Message not found');
    return message.roomId;
  }

  // ── Search Messages ───────────────────────────────────────────────
  // NEW: full-text search within a room
  async searchMessages(roomId: string, firebaseUid: string, query: string) {
    const user = await this.getDbUser(firebaseUid);
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this room');

    return this.prisma.message.findMany({
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
    });
  }

  // ── Get Room Media ────────────────────────────────────────────────
  // NEW: returns all image/video/audio/file messages for a room
  async getRoomMedia(roomId: string, firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this room');

    return this.prisma.message.findMany({
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
    });
  }

  // ── Create Message ────────────────────────────────────────────────
  async createMessage(
    roomId: string,
    senderId: string,
    text: string,
    options?: {
      mediaUrl?: string;
      mediaType?: string;
      // NEW: accepts audio types from all browsers
      type?: 'text' | 'image' | 'video' | 'audio' | 'file';
      replyToId?: string;
    },
  ) {
    const sender = await this.getDbUser(senderId);
    const messageType = options?.type ?? 'text';
    if (typeof text !== 'string' || text.length > 10_000 || (options?.mediaUrl !== undefined && (typeof options.mediaUrl !== 'string' || options.mediaUrl.length > 2_000)) ||
        (options?.mediaType !== undefined && (typeof options.mediaType !== 'string' || options.mediaType.length > 100)) ||
        !['text', 'image', 'video', 'audio', 'file'].includes(messageType)) {
      throw new BadRequestException('Invalid message content.');
    }
    if (!text.trim() && !options?.mediaUrl) throw new BadRequestException('Message content is required.');
    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: sender.id, roomId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this room');
    if (options?.replyToId) {
      const repliedTo = await this.prisma.message.findFirst({
        where: { id: options.replyToId, roomId }, select: { id: true },
      });
      if (!repliedTo) throw new NotFoundException('Replied-to message not found');
    }
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
    if (!emoji || emoji.length > 32) throw new ForbiddenException('Invalid reaction');
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: { roomId: true } });
    if (!message) throw new NotFoundException('Message not found');
    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId: message.roomId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this room');
    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId: { messageId, userId: user.id } },
    });

    if (existing) {
      if (existing.emoji === emoji) {
        return this.prisma.messageReaction.delete({
          where: { messageId_userId: { messageId, userId: user.id } },
        });
      }
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
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this room');
    return this.prisma.message.updateMany({
      where: { roomId, isRead: false, senderId: { not: user.id } },
      data: { isRead: true },
    });
  }

  // ── Get Room by ID ────────────────────────────────────────────────
  async getRoomById(roomId: string, firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this room');
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
    if ((data.text?.length ?? 0) > 1_000 || (data.mediaUrl?.length ?? 0) > 2_000 ||
        !['text', 'image', 'video'].includes(data.type ?? 'text')) {
      throw new ForbiddenException('Invalid status content.');
    }
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
    const user = await this.getDbUser(firebaseUid);
    const statuses = await this.prisma.status.findMany({
      where: {
        expiresAt: { gt: new Date() },
        OR: [{ userId: user.id }, ...(user.universityId ? [{ user: { universityId: user.universityId } }] : [])],
      },
      include: {
        user: { select: { id: true, displayName: true, photoURL: true } },
        views: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return statuses.map((status) => ({ ...status, views: status.userId === user.id ? status.views : [] }));
  }

  async viewStatus(firebaseUid: string, statusId: string) {
    const user = await this.getDbUser(firebaseUid);
    const status = await this.prisma.status.findFirst({
      where: {
        id: statusId,
        expiresAt: { gt: new Date() },
        ...(user.universityId ? { user: { universityId: user.universityId } } : { userId: user.id }),
      },
      select: { id: true },
    });
    if (!status) throw new NotFoundException('Status not found');
    return this.prisma.statusView.upsert({
      where: { statusId_userId: { statusId, userId: user.id } },
      update: {},
      create: { statusId, userId: user.id },
    });
  }
}
