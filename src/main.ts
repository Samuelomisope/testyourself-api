import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as express from 'express';
import { createClient } from 'redis';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { ServerOptions } from 'socket.io';

const cookieParser = require('cookie-parser');

class RedisIoAdapter extends IoAdapter {
  constructor(
    app: any,
    private readonly pubClient: any,
    private readonly subClient: any,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(createAdapter(this.pubClient, this.subClient));
    return server;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());

  app.use(helmet({
    crossOriginOpenerPolicy: false,
  }));

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://testyourself-nu.vercel.app',
      'https://www.unilib.com.ng',
      'https://unilib.com.ng',
    ],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Redis-backed Socket.io adapter — lets WebSocket connections work
  // correctly if this app ever scales to multiple instances.
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);

  const redisIoAdapter = new RedisIoAdapter(app, pubClient, subClient);
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(3000);
  console.log('Server running on http://localhost:3000');
}
bootstrap();