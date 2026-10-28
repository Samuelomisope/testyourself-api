import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_ORIGINS = new Set([
  'https://unilib.com.ng',
  'https://www.unilib.com.ng',
  'https://testyourself-nu.vercel.app',
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://localhost:3000']),
]);

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => callback(null, !origin || ALLOWED_ORIGINS.has(origin)),
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly socketUserMap = new Map<string, string>();
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const authorization = client.handshake.headers.authorization;
      const headerToken = typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : undefined;
      const token = client.handshake.auth?.accessToken ?? client.handshake.auth?.token ?? headerToken;
      if (typeof token !== 'string' || !token) throw new Error('Missing token');

      const payload = await this.jwtService.verifyAsync(token);
      if (typeof payload.sub !== 'string') throw new Error('Invalid token subject');
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub }, select: { id: true, isBanned: true },
      });
      if (!user || user.isBanned) throw new Error('Account unavailable');

      const sockets = this.userSockets.get(user.id) ?? new Set<string>();
      const wasOffline = sockets.size === 0;
      sockets.add(client.id);
      this.userSockets.set(user.id, sockets);
      this.socketUserMap.set(client.id, user.id);
      client.data.userId = user.id;
      if (wasOffline) {
        await this.chatService.setUserOnline(user.id, true);
        this.server.emit('userOnline', { userId: user.id });
      }
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.socketUserMap.get(client.id);
    this.socketUserMap.delete(client.id);
    if (!userId) return;

    const sockets = this.userSockets.get(userId);
    sockets?.delete(client.id);
    if (sockets?.size) return;
    this.userSockets.delete(userId);
    try {
      await this.chatService.setUserOnline(userId, false);
      this.server.emit('userOffline', { userId });
    } catch {
      // A disconnect must not cause an unhandled gateway exception.
    }
  }

  private userId(client: Socket): string | undefined {
    return client.data.userId;
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    const userId = this.userId(client);
    if (!userId || typeof data?.roomId !== 'string') return;
    try {
      await this.chatService.assertRoomMember(data.roomId, userId);
      await client.join(data.roomId);
      client.emit('joinedRoom', { roomId: data.roomId });
    } catch {
      client.emit('error', { message: 'You cannot join this room' });
    }
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    const userId = this.userId(client);
    if (!userId || typeof data?.roomId !== 'string') return;
    try {
      await this.chatService.assertRoomMember(data.roomId, userId);
      await client.leave(data.roomId);
    } catch {
      client.emit('error', { message: 'You cannot access this room' });
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: { roomId: string; text?: string; mediaUrl?: string; mediaType?: string; type?: 'text' | 'image' | 'video' | 'audio' | 'file'; replyToId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.userId(client);
    if (!userId || typeof data?.roomId !== 'string') return;
    try {
      const message = await this.chatService.createMessage(data.roomId, userId, data.text ?? '', {
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        type: data.type,
        replyToId: data.replyToId,
      });
      this.server.to(data.roomId).emit('newMessage', message);
    } catch {
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('reactMessage')
  async handleReaction(
    @MessageBody() data: { messageId: string; emoji: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.userId(client);
    if (!userId || typeof data?.messageId !== 'string') return;
    try {
      const reaction = await this.chatService.reactToMessage(userId, data.messageId, data.emoji);
      const roomId = await this.chatService.getMessageRoomId(data.messageId);
      this.server.to(roomId).emit('messageReaction', { messageId: data.messageId, reaction });
    } catch {
      client.emit('error', { message: 'Failed to react' });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() data: { roomId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.userId(client);
    if (!userId || typeof data?.roomId !== 'string' || typeof data.isTyping !== 'boolean') return;
    try {
      await this.chatService.assertRoomMember(data.roomId, userId);
      client.to(data.roomId).emit('userTyping', { userId, isTyping: data.isTyping });
    } catch {
      client.emit('error', { message: 'You cannot access this room' });
    }
  }
}
