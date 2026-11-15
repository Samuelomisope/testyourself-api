import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceService } from './marketplace.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: PrismaService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: NotificationsService, useValue: {} }
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
