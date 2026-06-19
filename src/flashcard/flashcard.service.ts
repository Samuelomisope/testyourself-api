import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateSM2, ReviewRating } from './sm2';

@Injectable()
export class FlashcardService {
  constructor(private prisma: PrismaService) {}

  // ── DECKS ─────────────────────────────────────────────

  async createDeck(data: {
    title: string;
    description?: string;
    userId: string;
    universityId: string;
    isPublic?: boolean;
    cards: { front: string; back: string }[];
    sourceType?: 'MANUAL' | 'AI_GENERATED';
    sourceMaterialId?: string;
  }) {
    const deck = await this.prisma.flashcardDeck.create({
      data: {
        title: data.title,
        description: data.description,
        userId: data.userId,
        universityId: data.universityId,
        isPublic: data.isPublic ?? true,
        sourceType: data.sourceType ?? 'MANUAL',
        sourceMaterialId: data.sourceMaterialId,
        cards: {
          create: data.cards.map((c) => ({ front: c.front, back: c.back })),
        },
      },
      include: { cards: true },
    });

    await this.prisma.activityLog.create({
      data: {
        userId: data.userId,
        type: 'flashcard',
        description: `Created flashcard deck "${data.title}"`,
        href: '/flashcards',
      },
    });

    return deck;
  }

  async findAll(userId: string, universityId: string) {
    return this.prisma.flashcardDeck.findMany({
      where: {
        universityId,
        OR: [{ isPublic: true }, { userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { displayName: true, photoURL: true } },
        cards: { select: { id: true } }, // just for counts on the list view
      },
    });
  }

  async findMine(userId: string) {
    return this.prisma.flashcardDeck.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { cards: { select: { id: true } } },
    });
  }

  async findOne(id: string) {
    const deck = await this.prisma.flashcardDeck.findUnique({
      where: { id },
      include: {
        cards: true,
        user: { select: { displayName: true, photoURL: true } },
      },
    });
    if (!deck) throw new NotFoundException('Flashcard deck not found');
    return deck;
  }

  async addCards(deckId: string, userId: string, cards: { front: string; back: string }[]) {
    const deck = await this.prisma.flashcardDeck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Flashcard deck not found');
    if (deck.userId !== userId) throw new ForbiddenException('Not your deck');

    return this.prisma.flashcard.createMany({
      data: cards.map((c) => ({ deckId, front: c.front, back: c.back })),
    });
  }

  async deleteDeck(id: string, userId: string) {
    const deck = await this.prisma.flashcardDeck.findUnique({ where: { id } });
    if (!deck) throw new NotFoundException('Flashcard deck not found');
    if (deck.userId !== userId) throw new ForbiddenException('Not your deck');
    return this.prisma.flashcardDeck.delete({ where: { id } });
  }

  // ── REVIEW (SM-2) ─────────────────────────────────────

  // Cards due for this user right now, across a specific deck
  async getDueCards(deckId: string, userId: string) {
    const cards = await this.prisma.flashcard.findMany({
      where: { deckId },
      include: {
        progress: { where: { userId } },
      },
    });

    const now = new Date();
    return cards
      .map((card) => {
        const progress = card.progress[0]; // unique per (userId, flashcardId)
        const due = !progress || progress.nextReviewDate <= now;
        return { card, progress, due };
      })
      .filter((c) => c.due)
      .map(({ card, progress }) => ({
        id: card.id,
        front: card.front,
        back: card.back,
        easeFactor: progress?.easeFactor ?? 2.5,
        interval: progress?.interval ?? 0,
        repetitions: progress?.repetitions ?? 0,
      }));
  }

  async reviewCard(flashcardId: string, userId: string, rating: ReviewRating) {
    const card = await this.prisma.flashcard.findUnique({ where: { id: flashcardId } });
    if (!card) throw new NotFoundException('Flashcard not found');

    const existing = await this.prisma.flashcardProgress.findUnique({
      where: { userId_flashcardId: { userId, flashcardId } },
    });

    const result = calculateSM2(
      {
        easeFactor: existing?.easeFactor ?? 2.5,
        interval: existing?.interval ?? 0,
        repetitions: existing?.repetitions ?? 0,
      },
      rating,
    );

    const progress = await this.prisma.flashcardProgress.upsert({
      where: { userId_flashcardId: { userId, flashcardId } },
      create: {
        userId,
        flashcardId,
        easeFactor: result.easeFactor,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReviewDate: result.nextReviewDate,
        lastReviewedAt: new Date(),
      },
      update: {
        easeFactor: result.easeFactor,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReviewDate: result.nextReviewDate,
        lastReviewedAt: new Date(),
      },
    });

    await this.prisma.flashcardReviewLog.create({
      data: { flashcardId, userId, rating },
    });

    return progress;
  }
}