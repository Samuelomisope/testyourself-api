import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { extractCourseCodeCandidates, CourseCodeCandidate } from './course-code.util';

// Explicit Prisma payload type instead of deriving from a private method's
// return type — TS blocks indexed-access types (ClassName['method']) on
// private/protected members from outside the class, even within the same file.
export type CourseMatch = Prisma.CourseGetPayload<{
  include: {
    program: {
      include: {
        department: {
          include: { school: true };
        };
      };
    };
  };
}>;

export type RuleResult =
  | { outcome: 'RESOLVED'; course: CourseMatch; matchedCode: CourseCodeCandidate }
  | { outcome: 'AMBIGUOUS'; candidates: CourseMatch[]; matchedCode: CourseCodeCandidate }
  | { outcome: 'NO_MATCH' };

@Injectable()
export class ClassificationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  private async lookupCourseByCode(normalizedCode: string, universityId: string): Promise<CourseMatch[]> {
    return this.prisma.course.findMany({
      where: {
        code: normalizedCode,
        program: { department: { school: { universityId } } },
      },
      include: {
        program: {
          include: {
            department: {
              include: { school: true },
            },
          },
        },
      },
    });
  }

  /**
   * Runs the filename/text course-code rule against a single university's course catalog.
   *
   * Tries each extracted code candidate in order (filenames occasionally contain more
   * than one code — e.g. a combined past-question PDF). The first candidate that resolves
   * to exactly one Course wins immediately, since that's a confident, cheap, AI-free match.
   * If no candidate resolves uniquely, returns the first candidate that had *any* DB hits
   * as AMBIGUOUS (for the AI-classification slice / Needs Review to pick up), or NO_MATCH
   * if nothing in the filename/text matched a known course code at all.
   */
  async classifyByCourseCode(sourceText: string, universityId: string): Promise<RuleResult> {
    const candidates = extractCourseCodeCandidates(sourceText);
    if (candidates.length === 0) {
      return { outcome: 'NO_MATCH' };
    }

    let firstAmbiguous: { candidates: CourseMatch[]; matchedCode: CourseCodeCandidate } | null = null;

    for (const candidate of candidates) {
      const matches = await this.lookupCourseByCode(candidate.normalized, universityId);

      if (matches.length === 1) {
        return { outcome: 'RESOLVED', course: matches[0], matchedCode: candidate };
      }

      if (matches.length > 1 && !firstAmbiguous) {
        firstAmbiguous = { candidates: matches, matchedCode: candidate };
      }
    }

    if (firstAmbiguous) {
      return { outcome: 'AMBIGUOUS', ...firstAmbiguous };
    }

    return { outcome: 'NO_MATCH' };
  }
}