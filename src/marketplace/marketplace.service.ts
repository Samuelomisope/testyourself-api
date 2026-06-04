import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MarketplaceService {
  constructor(private prisma: PrismaService) {}

  // ── Helper: get DB user from Firebase UID ────────────────────────
  private async getDbUser(firebaseUid: string) {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ── Seller/Buyer Onboarding ──────────────────────────────────────
  async createSellerProfile(firebaseUid: string, data: { bio?: string; chatSnapUsername?: string; whatsapp?: string }) {
    const user = await this.getDbUser(firebaseUid);
    return this.prisma.sellerProfile.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });
  }

  async createBuyerProfile(firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);
    return this.prisma.buyerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
  }

  // ── Listings ─────────────────────────────────────────────────────
  async getListings(filters: {
    search?: string;
    category?: string;
    type?: string;
    condition?: string;
    minPrice?: number;
    maxPrice?: number;
    universityId?: string;
  }) {
    const { search, category, type, condition, minPrice, maxPrice, universityId } = filters;

    return this.prisma.marketplaceItem.findMany({
      where: {
        status: 'ACTIVE',
        ...(universityId && { universityId }),
        ...(category && { category }),
        ...(type && { type: type as any }),
        ...(condition && { condition: condition as any }),
        ...(minPrice || maxPrice ? {
          price: {
            ...(minPrice && { gte: minPrice }),
            ...(maxPrice && { lte: maxPrice }),
          }
        } : {}),
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        user: { select: { id: true, displayName: true, photoURL: true } },
        university: { select: { shortName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getListingById(id: string) {
    const item = await this.prisma.marketplaceItem.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true, displayName: true, photoURL: true,
            sellerProfile: true,
          },
        },
        university: { select: { shortName: true } },
        reviews: {
          include: {
            user: { select: { displayName: true, photoURL: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Listing not found');
    return item;
  }

  async getMyListings(firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);
    return this.prisma.marketplaceItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createListing(firebaseUid: string, data: {
    title: string;
    description: string;
    price: number;
    images: string[];
    category?: string;
    type?: string;
    condition?: string;
    tags?: string[];
  }) {
    const user = await this.getDbUser(firebaseUid);
    if (!user.universityId) throw new ForbiddenException('You must belong to a university to list items');

    return this.prisma.marketplaceItem.create({
      data: {
        userId: user.id,
        universityId: user.universityId,
        title: data.title,
        description: data.description,
        price: data.price,
        images: data.images || [],
        category: data.category,
        type: (data.type as any) || 'PHYSICAL',
        condition: (data.condition as any) || 'GOOD',
        tags: data.tags || [],
      },
    });
  }

  async updateListing(id: string, firebaseUid: string, data: any) {
    const user = await this.getDbUser(firebaseUid);
    const item = await this.prisma.marketplaceItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Listing not found');
    if (item.userId !== user.id) throw new ForbiddenException('Not your listing');

    return this.prisma.marketplaceItem.update({ where: { id }, data });
  }

  async deleteListing(id: string, firebaseUid: string) {
    const user = await this.getDbUser(firebaseUid);
    const item = await this.prisma.marketplaceItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Listing not found');
    if (item.userId !== user.id) throw new ForbiddenException('Not your listing');

    return this.prisma.marketplaceItem.delete({ where: { id } });
  }

  // ── Reviews ──────────────────────────────────────────────────────
  async addReview(firebaseUid: string, itemId: string, data: { rating: number; comment?: string }) {
    const user = await this.getDbUser(firebaseUid);

    const review = await this.prisma.review.create({
      data: { userId: user.id, itemId, rating: data.rating, comment: data.comment },
    });

    // Recalculate seller rating
    const item = await this.prisma.marketplaceItem.findUnique({
      where: { id: itemId },
      include: { user: { select: { id: true, displayName: true } } },
    });

    if (item) {
      const reviews = await this.prisma.review.findMany({
        where: { item: { userId: item.userId } },
      });
      const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

      // Update seller rating
      await this.prisma.sellerProfile.updateMany({
        where: { userId: item.userId },
        data: { rating: avg },
      });

      // Notify seller
      if (item.userId !== user.id) {
        await this.prisma.notification.create({
          data: {
            userId: item.userId,
            title: 'New Review',
            body: `${user.displayName} gave your listing "${item.title}" a ${data.rating}-star review.${data.comment ? ` "${data.comment}"` : ''}`,
            type: 'marketplace',
          },
        });
      }
    }

    return review;
  }

  // ── Seller Profile ────────────────────────────────────────────────
  async getSellerProfile(userId: string) {
    return this.prisma.sellerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            displayName: true, photoURL: true,
            university: { select: { shortName: true } },
          },
        },
      },
    });
  }
}