import {
  Controller, Get, Post, Body, Param, Query, UseGuards
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('chat')
@UseGuards(FirebaseAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('rooms')
  getMyRooms(@CurrentUser() user: FirebaseUser) {
    return this.chatService.getMyRooms(user.uid);
  }

  @Post('rooms/dm')
  getOrCreateDM(@CurrentUser() user: FirebaseUser, @Body('targetUserId') targetUserId: string) {
    return this.chatService.getOrCreateDM(user.uid, targetUserId);
  }

  @Post('rooms/group')
  getOrCreateGroup(@CurrentUser() user: FirebaseUser, @Body('universityId') universityId: string) {
    return this.chatService.getOrCreateGroupRoom(universityId);
  }

  @Post('rooms/:roomId/join')
  joinRoom(@CurrentUser() user: FirebaseUser, @Param('roomId') roomId: string) {
    return this.chatService.joinGroupRoom(user.uid, roomId);
  }

  @Get('rooms/:roomId')
  getRoomById(@Param('roomId') roomId: string) {
    return this.chatService.getRoomById(roomId);
  }

  @Get('rooms/:roomId/messages')
  getMessages(@CurrentUser() user: FirebaseUser, @Param('roomId') roomId: string, @Query('cursor') cursor: string) {
    return this.chatService.getMessages(roomId, user.uid, cursor);
  }

  @Post('rooms/:roomId/read')
  markAsRead(@CurrentUser() user: FirebaseUser, @Param('roomId') roomId: string) {
    return this.chatService.markAsRead(roomId, user.uid);
  }

  @Post('messages/:messageId/react')
  reactToMessage(@CurrentUser() user: FirebaseUser, @Param('messageId') messageId: string, @Body('emoji') emoji: string) {
    return this.chatService.reactToMessage(user.uid, messageId, emoji);
  }

  @Get('status')
  getStatuses(@CurrentUser() user: FirebaseUser) {
    return this.chatService.getStatuses(user.uid);
  }

  @Post('status')
  createStatus(@CurrentUser() user: FirebaseUser, @Body() body: { text?: string; mediaUrl?: string; type?: string }) {
    return this.chatService.createStatus(user.uid, body);
  }

  @Post('status/:statusId/view')
  viewStatus(@CurrentUser() user: FirebaseUser, @Param('statusId') statusId: string) {
    return this.chatService.viewStatus(user.uid, statusId);
  }

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