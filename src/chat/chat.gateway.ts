import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Track which userId belongs to which socket, so we know who
  // disconnected when handleDisconnect fires (it only gives us the socket).
  private socketUserMap = new Map<string, string>(); // socketId -> userId

  constructor(private readonly chatService: ChatService) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId || client.handshake.query?.userId as string;
    if (!userId) {
      console.log(`Client connected without userId: ${client.id}`);
      return;
    }

    this.socketUserMap.set(client.id, userId);
    await this.chatService.setUserOnline(userId, true);
    this.server.emit('userOnline', { userId });
    console.log(`Client connected: ${client.id} (user ${userId})`);
  }

  async handleDisconnect(client: Socket) {
    const userId = this.socketUserMap.get(client.id);
    this.socketUserMap.delete(client.id);

    if (userId) {
      await this.chatService.setUserOnline(userId, false);
      this.server.emit('userOffline', { userId });
      console.log(`Client disconnected: ${client.id} (user ${userId})`);
    } else {
      console.log(`Client disconnected: ${client.id}`);
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.roomId);
    client.emit('joinedRoom', { roomId: data.roomId });
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(data.roomId);
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: {
      roomId: string;
      senderId: string;
      text: string;
      mediaUrl?: string;
      mediaType?: string;
      // NEW: now accepts 'audio' type with any browser mime type
      type?: 'text' | 'image' | 'video' | 'audio' | 'file';
      replyToId?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const message = await this.chatService.createMessage(
        data.roomId,
        data.senderId,
        data.text,
        {
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          type: data.type,
          replyToId: data.replyToId,
        },
      );
      this.server.to(data.roomId).emit('newMessage', message);
    } catch (err) {
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('reactMessage')
  async handleReaction(
    @MessageBody() data: {
      messageId: string;
      userId: string;
      emoji: string;
      roomId: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const reaction = await this.chatService.reactToMessage(
        data.userId,
        data.messageId,
        data.emoji,
      );
      this.server.to(data.roomId).emit('messageReaction', {
        messageId: data.messageId,
        reaction,
      });
    } catch (err) {
      client.emit('error', { message: 'Failed to react' });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { roomId: string; userId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    client.to(data.roomId).emit('userTyping', {
      userId: data.userId,
      isTyping: data.isTyping,
    });
  }
}
