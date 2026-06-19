import {
  Controller, Get, Post, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { FlashcardService } from './flashcard.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewRating } from './sm2';

@Controller('flashcards')
@UseGuards(FirebaseAuthGuard)
export class FlashcardController {
  constructor(
    private readonly flashcardService: FlashcardService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('decks')
  async createDeck(
    @Body() body: {
      title: string;
      description?: string;
      isPublic?: boolean;
      cards: { front: string; back: string }[];
    },
    @CurrentUser() currentUser: FirebaseUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) throw new Error('User not found');
    if (!user.universityId) throw new Error('University not set. Please set your university in your profile.');

    return this.flashcardService.createDeck({
      title: body.title,
      description: body.description,
      userId: user.id,
      universityId: user.universityId,
      isPublic: body.isPublic,
      cards: body.cards,
    });
  }

  @Get('decks')
  async findAll(@CurrentUser() currentUser: FirebaseUser) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user || !user.universityId) return [];
    return this.flashcardService.findAll(user.id, user.universityId);
  }

  @Get('decks/my')
  async findMine(@CurrentUser() currentUser: FirebaseUser) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) return [];
    return this.flashcardService.findMine(user.id);
  }

  @Get('decks/:id')
  async findOne(@Param('id') id: string) {
    return this.flashcardService.findOne(id);
  }

  @Post('decks/:id/cards')
  async addCards(
    @Param('id') id: string,
    @Body() body: { cards: { front: string; back: string }[] },
    @CurrentUser() currentUser: FirebaseUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) throw new Error('User not found');
    return this.flashcardService.addCards(id, user.id, body.cards);
  }

  @Delete('decks/:id')
  async deleteDeck(@Param('id') id: string, @CurrentUser() currentUser: FirebaseUser) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) throw new Error('User not found');
    return this.flashcardService.deleteDeck(id, user.id);
  }

  // ── REVIEW (SM-2) ─────────────────────────────────────

  @Get('decks/:id/due')
  async getDueCards(@Param('id') id: string, @CurrentUser() currentUser: FirebaseUser) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) return [];
    return this.flashcardService.getDueCards(id, user.id);
  }

  @Post('cards/:id/review')
  async reviewCard(
    @Param('id') id: string,
    @Body() body: { rating: ReviewRating },
    @CurrentUser() currentUser: FirebaseUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) throw new Error('User not found');
    return this.flashcardService.reviewCard(id, user.id, body.rating);
  }
}