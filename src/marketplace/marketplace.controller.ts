import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../common/decorators/current-user.decorator';

@Controller('marketplace')
@UseGuards(FirebaseAuthGuard)
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // ── Onboarding ───────────────────────────────────────────────────
  @Post('seller/onboard')
  createSellerProfile(@CurrentUser() user: FirebaseUser, @Body() body: { bio?: string; chatSnapUsername?: string; whatsapp?: string }) {
    return this.marketplaceService.createSellerProfile(user.uid, body);
  }

  @Post('buyer/onboard')
  createBuyerProfile(@CurrentUser() user: FirebaseUser) {
    return this.marketplaceService.createBuyerProfile(user.uid);
  }

  // ── Listings ─────────────────────────────────────────────────────
  @Get()
  getListings(@Query() query: {
    search?: string;
    category?: string;
    type?: string;
    condition?: string;
    minPrice?: string;
    maxPrice?: string;
    universityId?: string;
  }) {
    return this.marketplaceService.getListings({
      ...query,
      minPrice: query.minPrice ? parseFloat(query.minPrice) : undefined,
      maxPrice: query.maxPrice ? parseFloat(query.maxPrice) : undefined,
    });
  }

  @Get('my')
  getMyListings(@CurrentUser() user: FirebaseUser) {
    return this.marketplaceService.getMyListings(user.uid);
  }

  @Get('seller/:userId')
  getSellerProfile(@Param('userId') userId: string) {
    return this.marketplaceService.getSellerProfile(userId);
  }

  @Get(':id')
  getListingById(@Param('id') id: string) {
    return this.marketplaceService.getListingById(id);
  }

  @Post()
createListing(@CurrentUser() user: FirebaseUser, @Body() body: any) {
  return this.marketplaceService.createListing(user.uid, body);
}
  @Patch(':id')
  updateListing(@CurrentUser() user: FirebaseUser, @Param('id') id: string, @Body() body: any) {
    return this.marketplaceService.updateListing(id, user.uid, body);
  }

  @Delete(':id')
  deleteListing(@CurrentUser() user: FirebaseUser, @Param('id') id: string) {
    return this.marketplaceService.deleteListing(id, user.uid);
  }

  // ── Reviews ──────────────────────────────────────────────────────
  @Post(':id/reviews')
  addReview(@CurrentUser() user: FirebaseUser, @Param('id') itemId: string, @Body() body: { rating: number; comment?: string }) {
    return this.marketplaceService.addReview(user.uid, itemId, body);
  }
}