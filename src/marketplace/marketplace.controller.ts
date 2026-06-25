import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('marketplace')
@UseGuards(JwtAuthGuard)
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // ── Onboarding ───────────────────────────────────────────────────
  @Post('seller/onboard')
  createSellerProfile(@CurrentUser() user: AuthUser, @Body() body: { bio?: string; chatSnapUsername?: string; whatsapp?: string }) {
    return this.marketplaceService.createSellerProfile(user.sub, body);
  }

  @Post('buyer/onboard')
  createBuyerProfile(@CurrentUser() user: AuthUser) {
    return this.marketplaceService.createBuyerProfile(user.sub);
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
  getMyListings(@CurrentUser() user: AuthUser) {
    return this.marketplaceService.getMyListings(user.sub);
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
createListing(@CurrentUser() user: AuthUser, @Body() body: any) {
  return this.marketplaceService.createListing(user.sub, body);
}
  @Patch(':id')
  updateListing(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.marketplaceService.updateListing(id, user.sub, body);
  }

  @Delete(':id')
  deleteListing(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.marketplaceService.deleteListing(id, user.sub);
  }

  // ── Reviews ──────────────────────────────────────────────────────
  @Post(':id/reviews')
  addReview(@CurrentUser() user: AuthUser, @Param('id') itemId: string, @Body() body: { rating: number; comment?: string }) {
    return this.marketplaceService.addReview(user.sub, itemId, body);
  }
}
