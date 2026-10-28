import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class MarketplaceService {
  constructor(private prisma: PrismaService, private readonly uploadService: UploadService) {}

  // ── Helper: get DB user from Firebase UID ────────────────────────
 private async getDbUser(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
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
    if ((minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) ||
        (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
        (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) ||
        (search?.length ?? 0) > 100) throw new BadRequestException('Invalid listing filters.');
    if (type && !['PHYSICAL', 'DIGITAL', 'SERVICE'].includes(type)) throw new BadRequestException('Invalid listing type.');
    if (condition && !['NEW', 'GOOD', 'FAIR', 'POOR'].includes(condition)) throw new BadRequestException('Invalid condition.');

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
    this.validateListing(data);
    const user = await this.getDbUser(firebaseUid);
    this.validateListingImages(data.images ?? [], user.id);
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
        type: data.type || 'PHYSICAL',
        condition: data.condition || 'GOOD',
        tags: data.tags || [],
      },
    });
  }

  async updateListing(id: string, firebaseUid: string, data: {
    title?: string;
    description?: string;
    price?: number;
    images?: string[];
    category?: string;
    type?: string;
    condition?: string;
    tags?: string[];
  }) {
    this.validateListing(data, true);
    const user = await this.getDbUser(firebaseUid);
    if (data.images !== undefined) this.validateListingImages(data.images, user.id);
    const item = await this.prisma.marketplaceItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Listing not found');
    if (item.userId !== user.id) throw new ForbiddenException('Not your listing');

    // Explicitly whitelist editable listing fields. Never accept ownership,
    // university, timestamps, or moderation state from the client.
    const updateData = {
      ...(typeof data.title === 'string' && { title: data.title }),
      ...(typeof data.description === 'string' && { description: data.description }),
      ...(typeof data.price === 'number' && Number.isFinite(data.price) && { price: data.price }),
      ...(Array.isArray(data.images) && { images: data.images }),
      ...(typeof data.category === 'string' && { category: data.category }),
      ...(typeof data.type === 'string' && { type: data.type }),
      ...(typeof data.condition === 'string' && { condition: data.condition }),
      ...(Array.isArray(data.tags) && { tags: data.tags }),
    };

    return this.prisma.marketplaceItem.update({ where: { id }, data: updateData });
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
    if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5 || (data.comment?.length ?? 0) > 1_000) {
      throw new BadRequestException('Rating must be an integer from 1 to 5 and comment must be at most 1,000 characters.');
    }
    const user = await this.getDbUser(firebaseUid);

    const itemOwner = await this.prisma.marketplaceItem.findUnique({ where: { id: itemId }, select: { userId: true } });
    if (!itemOwner) throw new NotFoundException('Listing not found');
    if (itemOwner.userId === user.id) throw new ForbiddenException('You cannot review your own listing.');
    const existingReview = await this.prisma.review.findFirst({ where: { userId: user.id, itemId } });
    if (existingReview) throw new ConflictException('You have already reviewed this listing.');

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

  private validateListing(data: Record<string, any>, partial = false) {
    if (!partial || data.title !== undefined) {
      if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120) throw new BadRequestException('Title must be 1 to 120 characters.');
    }
    if (!partial || data.description !== undefined) {
      if (typeof data.description !== 'string' || !data.description.trim() || data.description.length > 10_000) throw new BadRequestException('Description must be 1 to 10,000 characters.');
    }
    if (!partial || data.price !== undefined) {
      if (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price < 0 || data.price > 1_000_000_000) throw new BadRequestException('Price is invalid.');
    }
    if (data.type !== undefined && !['PHYSICAL', 'DIGITAL', 'SERVICE'].includes(data.type)) throw new BadRequestException('Invalid listing type.');
    if (data.condition !== undefined && !['NEW', 'GOOD', 'FAIR', 'POOR'].includes(data.condition)) throw new BadRequestException('Invalid condition.');
    for (const field of ['images', 'tags'] as const) {
      if (data[field] !== undefined && (!Array.isArray(data[field]) || data[field].length > 20 || data[field].some((v: unknown) => typeof v !== 'string' || v.length > 2_000))) {
        throw new BadRequestException(`${field} must contain at most 20 short strings.`);
      }
    }
    if (data.category !== undefined && (typeof data.category !== 'string' || data.category.length > 80)) throw new BadRequestException('Invalid category.');
  }

  private validateListingImages(images: string[], userId: string) {
    for (const image of images) {
      let url: URL;
      try { url = new URL(image); } catch { throw new BadRequestException('Listing images must be valid HTTPS URLs.'); }
      if (url.protocol !== 'https:') throw new BadRequestException('Listing images must use HTTPS.');
      if (this.uploadService.isStorageReference(image) && !this.uploadService.isOwnedUserUpload(image, userId, 'marketplace')) {
        throw new ForbiddenException('Listing images must be uploaded by you to the marketplace folder.');
      }
    }
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

  async getSellerReviews(sellerId: string) {
  return this.prisma.review.findMany({
    where: { item: { userId: sellerId } },
    include: {
      user: { select: { id: true, displayName: true, photoURL: true } },
      item: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
}
