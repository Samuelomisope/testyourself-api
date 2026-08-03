import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheService } from './cache.service';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        return new Redis(process.env.REDIS_URL!, {
        maxRetriesPerRequest: 3,
        });
      },
    },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule {}