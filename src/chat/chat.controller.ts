import {
  Controller, Get, Post, Body, Param, Query, UseGuards
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Rooms ─────────────────────────────────────────────────────────

  @Get('rooms')
  getMyRooms(@CurrentUser() user: AuthUser) {
    return this.chatService.getMyRooms(user.sub);
  }

  @Post('rooms/dm')
  getOrCreateDM(
    @CurrentUser() user: AuthUser,
    @Body('targetUserId') targetUserId: string,
  ) {
    return this.chatService.getOrCreateDM(user.sub, targetUserId);
  }

  @Post('rooms/group')
  getOrCreateGroup(
    @CurrentUser() user: AuthUser,
    @Body('universityId') universityId: string,
  ) {
    return this.chatService.getOrCreateGroupRoom(universityId);
  }

  // NEW: Create a custom named group with selected members
  @Post('rooms/create-group')
  createCustomGroup(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string; memberIds: string[] },
  ) {
    return this.chatService.createCustomGroup(user.sub, body.name, body.memberIds);
  }

  @Post('rooms/:roomId/join')
  joinRoom(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.chatService.joinGroupRoom(user.sub, roomId);
  }

  @Get('rooms/:roomId')
  getRoomById(@Param('roomId') roomId: string) {
    return this.chatService.getRoomById(roomId);
  }

  @Get('rooms/:roomId/messages')
  getMessages(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Query('cursor') cursor: string,
  ) {
    return this.chatService.getMessages(roomId, user.sub, cursor);
  }

  @Post('rooms/:roomId/read')
  markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.chatService.markAsRead(roomId, user.sub);
  }

  // NEW: Search messages inside a room
  @Get('rooms/:roomId/search')
  searchMessages(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Query('q') q: string,
  ) {
    return this.chatService.searchMessages(roomId, user.sub, q);
  }

  // NEW: Get all media (images, videos, audio, files) in a room
  @Get('rooms/:roomId/media')
  getRoomMedia(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.chatService.getRoomMedia(roomId, user.sub);
  }

  // ── Messages ──────────────────────────────────────────────────────

  @Post('messages/:messageId/react')
  reactToMessage(
    @CurrentUser() user: AuthUser,
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
  ) {
    return this.chatService.reactToMessage(user.sub, messageId, emoji);
  }

  // ── Status ────────────────────────────────────────────────────────

  @Get('status')
  getStatuses(@CurrentUser() user: AuthUser) {
    return this.chatService.getStatuses(user.sub);
  }

  @Post('status')
  createStatus(
    @CurrentUser() user: AuthUser,
    @Body() body: {
      text?: string;
      mediaUrl?: string;
      mediaType?: string;
      type?: string;
      bgColor?: string;
    },
  ) {
    return this.chatService.createStatus(user.sub, body);
  }

  @Post('status/:statusId/view')
  viewStatus(
    @CurrentUser() user: AuthUser,
    @Param('statusId') statusId: string,
  ) {
    return this.chatService.viewStatus(user.sub, statusId);
  }

  // ── Users ─────────────────────────────────────────────────────────

  @Get('users/search')
  async searchChatUsers(@Query('q') q: string) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { chatSnapUsername: { contains: q, mode: 'insensitive' } },
        ],
        isBanned: false,
      },
      take: 10,
      select: {
        id: true,
        displayName: true,
        photoURL: true,
        chatSnapUsername: true,
        university: { select: { shortName: true } },
      },
    });
  }
}
