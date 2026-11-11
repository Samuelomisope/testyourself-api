import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));
  app.use(cookieParser());

  app.use(helmet({
    crossOriginOpenerPolicy: false,
  }));

  const defaultAllowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://testyourself-nu.vercel.app',
      'https://www.unilib.com.ng',
      'https://unilib.com.ng',
    ];
  const configuredOrigins = process.env.CORS_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = configuredOrigins?.length
    ? configuredOrigins
    : defaultAllowedOrigins;
  const corsOrigins = process.env.NODE_ENV === 'production'
    ? allowedOrigins.filter((origin) => !origin.startsWith('http://localhost:'))
    : allowedOrigins;
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Redis-backed Socket.io adapter — lets WebSocket connections scale
  // across multiple instances. Non-fatal: if Redis is unreachable
  // (e.g. local dev with no Redis running), the app still boots and
  // Socket.io falls back to its default in-memory adapter — fine for
  // a single instance, just won't work correctly if you ever scale
  // to multiple server instances without Redis.
  try {
    const pubClient = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 5000 } });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (err) => console.error('Redis pub client error:', err.message));
    subClient.on('error', (err) => console.error('Redis sub client error:', err.message));
    await Promise.all([pubClient.connect(), subClient.connect()]);

    const redisIoAdapter = new RedisIoAdapter(app, pubClient, subClient);
    app.useWebSocketAdapter(redisIoAdapter);
    console.log('Redis connected — Socket.io using Redis adapter.');
  } catch (err) {
    console.warn('Redis unavailable, continuing without Redis adapter:', err.message);
  }

  app.enableShutdownHooks();
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`Server listening on port ${port}`);
}
bootstrap();
