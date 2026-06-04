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

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // Join a chat room
  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.roomId);
    client.emit('joinedRoom', { roomId: data.roomId });
  }

  // Leave a chat room
  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(data.roomId);
  }

  // Send a message
  @SubscribeMessage('sendMessage')
async handleMessage(
  @MessageBody() data: {
    roomId: string;
    senderId: string;
    text: string;
    mediaUrl?: string;
    mediaType?: string;
    type?: string;
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
  @MessageBody() data: { messageId: string; userId: string; emoji: string; roomId: string },
  @ConnectedSocket() client: Socket,
) {
  try {
    const reaction = await this.chatService.reactToMessage(data.userId, data.messageId, data.emoji);
    this.server.to(data.roomId).emit('messageReaction', { messageId: data.messageId, reaction });
  } catch (err) {
    client.emit('error', { message: 'Failed to react' });
  }
}

  // Typing indicator
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

