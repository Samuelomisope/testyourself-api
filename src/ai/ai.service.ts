import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createHash } from 'crypto';
import { CacheService } from '../redis/cache.service';
import { AIService as ProviderAIService } from '../provider/services/ai.service';
import { OCRService } from '../provider/services/ocr.service';
import { createCanvas } from 'canvas';

function parseModelJson(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!Array.isArray(parsed)) throw new Error('Expected an array');
    return parsed;
  } catch {
    throw new BadRequestException('The AI returned an invalid response. Please try again.');
  }
}

const SUMMARY_TRIGGER_COUNT = 8; // summarize once a session hits a multiple of this
const RECENT_MESSAGE_COUNT = 4;  // raw messages kept alongside the summary

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly aiService: ProviderAIService,
    private readonly ocrService: OCRService,
  ) {}

  // ─── Extract text from PDF buffer using pdfjs-dist ───────────────
 private async extractPdfText(buffer: Buffer): Promise<{ text: string; truncated: boolean; totalPages: number }> {
  try {
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true });
    const pdf = await loadingTask.promise;

    const pageLimit = 20;
    const pagesToRead = Math.min(pdf.numPages, pageLimit);
    const textParts: string[] = [];

    for (let i = 1; i <= pagesToRead; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();
      if (pageText) textParts.push(`[Page ${i}]\n${pageText}`);
    }

    return {
      text: textParts.join('\n\n'),
      truncated: pdf.numPages > pageLimit,
      totalPages: pdf.numPages,
    };
  } catch (err) {
    console.error('PDF text extraction failed:', err);
    return { text: '', truncated: false, totalPages: 0 };
  }
}


   // ─── Resolve any uploaded file (PDF or image) down to plain text ──
 private async resolveFileToText(
  fileData?: string,
  fileMimeType?: string,
): Promise<string> {
  if (!fileData || !fileMimeType) return '';

  const isPdf = fileMimeType === 'application/pdf' || fileMimeType === 'pdf';
  const buffer = Buffer.from(fileData, 'base64');

  if (isPdf) {
    const { text, truncated, totalPages } = await this.extractPdfText(buffer);

    if (text && text.length >= 20) {
      const notice = truncated
        ? `\n\n[Note: This document has ${totalPages} pages; only the first 20 were processed.]`
        : '';
      return this.capText(text + notice);
    }

    // No usable embedded text — likely a scanned PDF. Fall back to OCR.
    const ocrResult = await this.ocrScannedPdf(buffer);
    if (!ocrResult.text || ocrResult.text.length < 20) {
      throw new BadRequestException(
        'Could not read enough text from this PDF, even with OCR. Try a clearer scan or paste the content manually.',
      );
    }
    const ocrNotice = ocrResult.truncated
      ? `\n\n[Note: This scanned document has ${ocrResult.totalPages} pages; only the first 10 were processed via OCR.]`
      : '';
    return this.capText(ocrResult.text + ocrNotice);
  }

  if (fileMimeType.startsWith('image/')) {
    const ocrResult = await this.ocrService.extractText(buffer);
    if (!ocrResult.text || ocrResult.text.trim().length < 20) {
      throw new BadRequestException(
        'Could not read enough text from this image. Try a clearer, well-lit shot, or paste the content manually.',
      );
    }
    return this.capText(ocrResult.text);
  }

  return '';
}
  private capText(text: string, maxChars: number = 12000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[Note: content truncated to fit processing limits.]';
}

async chat(
  userId: string,
  sessionId: string | undefined,
  question: string,
  fileData?: string,
  fileMimeType?: string,
) {
  const validatedQuestion = question?.trim();
  if (!validatedQuestion && !fileData) {
    throw new BadRequestException('Provide a question or a supported file.');
  }

  let session = sessionId
    ? await this.prisma.chatSession.findFirst({ where: { id: sessionId, userId } })
    : null;

  if (sessionId && !session) {
    throw new NotFoundException('Chat session not found.');
  }

  if (!session) {
    session = await this.prisma.chatSession.create({
      data: { userId, title: validatedQuestion?.slice(0, 80) || 'Untitled chat' },
    });
  }

  // Build context: summary (if any) + last few raw messages
  const recentMessages = await this.prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'desc' },
    take: RECENT_MESSAGE_COUNT,
  });
  recentMessages.reverse();

  const historyBlock = [
    session.summary ? `Conversation summary so far: ${session.summary}` : '',
    recentMessages.length
      ? recentMessages.map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`).join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let answerText: string;

  if (fileData && fileMimeType?.startsWith('image/')) {
    const buffer = Buffer.from(fileData, 'base64');
    const prompt = historyBlock
      ? `${historyBlock}\n\nStudent's new question about this image: ${validatedQuestion || 'Please explain what you see.'}`
      : validatedQuestion || 'Please explain what you see in this image.';
    const response = await this.aiService.understandImage(buffer, prompt, fileMimeType);
    answerText = response.text;
  } else {
    const fileText = await this.resolveFileToText(fileData, fileMimeType);
    const prompt = [historyBlock, fileText ? `Document content:\n${fileText}` : '', `Student: ${validatedQuestion}`]
      .filter(Boolean)
      .join('\n\n');
    const response = await this.aiService.generate(prompt);
    answerText = response.text;
  }

  await this.prisma.chatMessage.createMany({
    data: [
      { sessionId: session.id, role: 'user', content: validatedQuestion || '[image]' },
      { sessionId: session.id, role: 'assistant', content: answerText },
    ],
  });
  await this.prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });

  const totalMessages = await this.prisma.chatMessage.count({ where: { sessionId: session.id } });
  if (totalMessages % SUMMARY_TRIGGER_COUNT === 0) {
    this.summarizeSession(session.id).catch((err) => console.error('Session summarization failed:', err));
  }

  return { sessionId: session.id, answer: answerText };
}

private async summarizeSession(sessionId: string) {
  const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  const messages = await this.prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });

  const transcript = messages.map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`).join('\n');
  const prompt = `Summarize this tutoring conversation in 3-5 sentences, preserving the topics and questions covered so far so the summary can be used as context for continuing the conversation later.${
    session.summary ? `\n\nPrevious summary: ${session.summary}` : ''
  }\n\nFull conversation:\n${transcript}`;

  const response = await this.aiService.generate(prompt);
  await this.prisma.chatSession.update({ where: { id: sessionId }, data: { summary: response.text } });
}

async listChatSessions(userId: string) {
  return this.prisma.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, updatedAt: true, createdAt: true },
  });
}

async getChatSession(userId: string, sessionId: string) {
  const session = await this.prisma.chatSession.findFirst({
    where: { id: sessionId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) throw new NotFoundException('Chat session not found.');
  return session;
}

// ─── Resolve a library material (by ID) down to plain text ────────
private async resolveMaterialToText(materialId: string): Promise<string> {
  const material = await this.prisma.studyMaterial.findUnique({ where: { id: materialId } });
  if (!material) throw new NotFoundException('Study material not found.');

  const isPdf = material.fileType === 'application/pdf' || material.fileType === 'pdf';
  if (!isPdf) throw new BadRequestException('Only PDF materials are supported.');

  const response = await fetch(material.fileUrl);
  if (!response.ok) throw new BadRequestException('Could not fetch the study material file.');

  const buffer = Buffer.from(await response.arrayBuffer());
  const { text: extractedText } = await this.extractPdfText(buffer);
  if (extractedText && extractedText.length > 100) return extractedText;

  const ocrResult = await this.ocrScannedPdf(buffer);
  if (ocrResult.text && ocrResult.text.length > 100) return ocrResult.text;

  throw new BadRequestException(
    'This PDF appears to be scanned and has no readable text, even with OCR. Please upload a text-based PDF or paste the content manually.',
  );
}
  // ─── Features ─────────────────────────────────────────────────────
  async generateQuiz(
    userId: string,
    text: string,
    count: number = 5,
    difficulty: string = 'Medium',
    fileData?: string,
    fileMimeType?: string,
  ) {
    const contentForHash = text || fileData || '';
    const contentHash = createHash('sha256').update(contentForHash).digest('hex');
    const cacheKey = `quiz:${contentHash}:${count}:${difficulty}`;

    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    const fileText = await this.resolveFileToText(fileData, fileMimeType);
    const combinedText = [text, fileText].filter(Boolean).join('\n\n');

    if (!combinedText) throw new BadRequestException('Provide text or a supported file.');

    const prompt = `You are given study material. Read it carefully and generate ${count} ${difficulty} multiple choice questions based ONLY on the specific content, facts, terms, and concepts found in this document. Do NOT generate generic questions. Every question must reference something explicitly stated in the document.

Return ONLY a valid JSON array. Format:
[{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A. ..."}]

Content:
${combinedText}`;

    const response = await this.aiService.generate(prompt);
    const questions = parseModelJson(response.text);
    const result = { questions };

    await this.saveGeneration(userId, 'quiz', text?.slice(0, 80) || 'Quiz', { text, count, difficulty }, result);
    await this.cacheService.set(cacheKey, result, 86400);
    return result;
  }

  // ─── Generate quiz from a library material ────────────────────────
 async generateQuizFromMaterial(
  userId: string,
  materialId: string,
  count: number = 5,
  difficulty: string = 'Medium',
) {
  const cacheKey = `quiz:material:${materialId}:${count}:${difficulty}`;
  const cached = await this.cacheService.get(cacheKey);
  if (cached) return cached;

  const extractedText = await this.resolveMaterialToText(materialId);
  const result = await this.generateQuiz(userId, extractedText, count, difficulty);
  await this.cacheService.set(cacheKey, result, 86400);
  return result;
}

 async generateRevisionMaterial(
  userId: string,
  text?: string,
  fileData?: string,
  fileMimeType?: string,
  materialId?: string,
) {
  const sourceText = materialId
    ? await this.resolveMaterialToText(materialId)
    : [text, await this.resolveFileToText(fileData, fileMimeType)].filter(Boolean).join('\n\n');

  if (!sourceText) throw new BadRequestException('Provide text, a file, or a material ID.');

  const contentHash = createHash('sha256').update(sourceText).digest('hex');
  const cacheKey = `revision:${contentHash}`;
  const cached = await this.cacheService.get(cacheKey);
  if (cached) return cached;

  const prompt = `Create a condensed revision sheet from this study material. Include: key definitions, important formulas (if any), core concepts a student is likely to be examined on, and any critical facts or dates. Format as clear sections with headers. Be concise — this is for quick pre-exam review, not a full explanation.

Content:
${sourceText}`;

  const response = await this.aiService.generate(prompt);
  const result = { revision: response.text };
  await this.saveGeneration(userId, 'revision', text?.slice(0, 80) || 'Revision sheet', { text, materialId }, result);
  await this.cacheService.set(cacheKey, result, 86400);
  return result;
}
async generatePracticeProblems(
  userId: string,
  text?: string,
  count: number = 5,
  difficulty: string = 'Medium',
  fileData?: string,
  fileMimeType?: string,
  materialId?: string,
) {
  const sourceText = materialId
    ? await this.resolveMaterialToText(materialId)
    : [text, await this.resolveFileToText(fileData, fileMimeType)].filter(Boolean).join('\n\n');

  if (!sourceText) throw new BadRequestException('Provide text, a file, or a material ID.');

  const contentHash = createHash('sha256').update(sourceText).digest('hex');
  const cacheKey = `practice:${contentHash}:${count}:${difficulty}`;
  const cached = await this.cacheService.get(cacheKey);
  if (cached) return cached;

  const prompt = `Generate ${count} ${difficulty} open-ended practice problems based ONLY on the specific concepts, facts, and methods in this study material. These should require worked solutions, not multiple choice. Include a full step-by-step solution for each.

Return ONLY a valid JSON array. Format:
[{"problem":"...","solution":"..."}]

Content:
${sourceText}`;

  const response = await this.aiService.generate(prompt);
  const problems = parseModelJson(response.text);
  const result = { problems };
  await this.saveGeneration(userId, 'practice', text?.slice(0, 80) || 'Practice problems', { text, materialId, count, difficulty }, result);
  await this.cacheService.set(cacheKey, result, 86400);
  return result;
}
  // ─── Explain a library material ────────────────────────────────────
async explainFromMaterial(userId: string, materialId: string, level: string = 'Detailed') {
  const cacheKey = `explain:material:${materialId}:${level}`;
  const cached = await this.cacheService.get(cacheKey);
  if (cached) return cached;

  const extractedText = await this.resolveMaterialToText(materialId);
  const result = await this.explain(userId, extractedText, level);
  await this.cacheService.set(cacheKey, result, 86400);
  return result;
}
  

async askQuestion(
  question: string,
  fileData?: string,
  fileMimeType?: string,
  history?: string,
) {
  if (fileData && fileMimeType?.startsWith('image/')) {
    const buffer = Buffer.from(fileData, 'base64');
    const response = await this.aiService.understandImage(
      buffer,
      question || 'Please explain what you see in this image.',
      fileMimeType,
    );
    return { answer: response.text };
  }

  const fileText = await this.resolveFileToText(fileData, fileMimeType);
  const historyBlock = history ? `Recent conversation:\n${history}\n\n` : '';
  const prompt = fileText
    ? `${historyBlock}${question || 'Please summarize and explain this document.'}\n\nDocument content:\n${fileText}`
    : `${historyBlock}${question}`;

  const response = await this.aiService.generate(prompt);
  return { answer: response.text };
}

  async summarize(
  userId: string,
  text: string,
  style: string = 'Bullet points',
  fileData?: string,
  fileMimeType?: string,
) {
  if (fileData && fileMimeType?.startsWith('image/')) {
    const buffer = Buffer.from(fileData, 'base64');
    const response = await this.aiService.understandImage(
      buffer,
      `Summarize this image's content as "${style}". Be concise and clear. For bullet points, use • as the bullet character.`,
      fileMimeType,
    );
    const result = { summary: response.text };
    await this.saveGeneration(userId, 'summarize', 'Summarized image', { style, fileMimeType }, result);
    return result;
  }

  const fileText = await this.resolveFileToText(fileData, fileMimeType);
  const combinedText = [text, fileText].filter(Boolean).join('\n\n');

  if (!combinedText) throw new BadRequestException('Provide text or a supported file.');

  const prompt = `Summarize the following content as "${style}". Be concise and clear.

Content:
${combinedText}`;

  const response = await this.aiService.generate(
    `You are a study assistant. For bullet points, use • as the bullet character.\n\n${prompt}`,
  );
  const result = { summary: response.text };
  await this.saveGeneration(userId, 'summarize', text?.slice(0, 80) || 'Summary', { text, style }, result);
  return result;
}

async explain(
  userId: string,
  text: string,
  level: string = 'Detailed',
  fileData?: string,
  fileMimeType?: string,
  continueFrom?: string,
) {
  if (continueFrom) {
    const prompt = `Continue this explanation exactly where it left off. Do not repeat anything already said — pick up seamlessly from the last sentence.\n\nPrevious explanation so far:\n"""${continueFrom}"""\n\nContinue from here.`;
    const response = await this.aiService.generate(prompt);
    return { explanation: response.text, truncated: response.truncated ?? false };
  }

  if (fileData && fileMimeType?.startsWith('image/')) {
    const buffer = Buffer.from(fileData, 'base64');
    const response = await this.aiService.understandImage(
      buffer,
      `Explain this content at a "${level}" level. Break down key concepts clearly, define any technical terms, and use examples where helpful.`,
      fileMimeType,
    );
    const result = { explanation: response.text, truncated: response.truncated ?? false };
    await this.saveGeneration(userId, 'explain', 'Explained image', { level, fileMimeType }, result);
    return result;
  }

  const fileText = await this.resolveFileToText(fileData, fileMimeType);
  const combinedText = [text, fileText].filter(Boolean).join('\n\n');

  if (!combinedText) throw new BadRequestException('Provide text or a supported file.');

  const levelInstruction = {
    'Simple': 'Use short sentences and everyday language. Avoid jargon; if a technical term is necessary, define it immediately.',
    'Detailed': 'Give a thorough explanation with proper terminology, covering the concept, why it matters, and how it connects to related ideas.',
    "Like I'm 5": 'Explain it the way you would to a curious child — use simple analogies and very basic language, no jargon at all.',
  }[level] ?? 'Give a clear, thorough explanation.';

  const prompt = `Explain the following content clearly. ${levelInstruction}

Content:
${combinedText}`;

  const response = await this.aiService.generate(prompt);
  const result = { explanation: response.text, truncated: response.truncated ?? false };
  await this.saveGeneration(userId, 'explain', text?.slice(0, 80) || 'Explanation', { text, level }, result);
  return result;
}
  async generateFlashcards(
    text?: string,
    count: number = 10,
    fileData?: string,
    fileMimeType?: string,
  ) {
    const contentForHash = text || fileData || '';
    const contentHash = createHash('sha256').update(contentForHash).digest('hex');
    const cacheKey = `flashcards:${contentHash}:${count}`;

    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    let combinedText = text || '';

    if (fileData && fileMimeType?.startsWith('image/')) {
      const buffer = Buffer.from(fileData, 'base64');
      const prompt = `Generate ${count} flashcards from this image.
Return ONLY a valid JSON array. Format:
[{"front":"...","back":"..."}]`;
      const response = await this.aiService.understandImage(buffer, prompt, fileMimeType);
      const flashcards = parseModelJson(response.text);
      const result = { flashcards };
      await this.cacheService.set(cacheKey, result, 86400);
      return result;
    }

    const fileText = await this.resolveFileToText(fileData, fileMimeType);
    combinedText = [combinedText, fileText].filter(Boolean).join('\n\n');

    if (!combinedText) throw new BadRequestException('Provide text or a supported file.');

    const prompt = `Generate ${count} flashcards from this text.
Return ONLY a valid JSON array. Format:
[{"front":"...","back":"..."}]

Text: ${combinedText}`;

    const response = await this.aiService.generate(prompt);
    const flashcards = parseModelJson(response.text);
    const result = { flashcards };

    await this.cacheService.set(cacheKey, result, 86400);
    return result;
  }

 async generateStudyPlan(
  userId: string,
  subject: string,
  daysAvailable: number = 7,
  hoursPerDay: number = 2,
  examDate?: string,
  text?: string,
  fileData?: string,
  fileMimeType?: string,
) {
  const fileText = await this.resolveFileToText(fileData, fileMimeType);
  const sourceContent = [text, fileText].filter(Boolean).join('\n\n');

  const contextBlock = sourceContent
    ? `\n\nThe student has provided this source material to base the plan on:\n${sourceContent}`
    : '';
  const examBlock = examDate ? `\n\nTarget exam/deadline date: ${examDate}` : '';

  const prompt = `Create a ${daysAvailable}-day study plan for the subject "${subject}", assuming the student can study about ${hoursPerDay} hour(s) per day.${examBlock}${contextBlock}

Break the plan into daily entries. Each day should have a clear focus area and 2-4 concrete tasks. Build in at least one review/recap day if the plan spans more than 5 days, and end with a final review day before any exam date given.

Return ONLY a valid JSON array. Format:
[{"day": 1, "focus": "...", "tasks": ["...", "..."]}]`;

  const response = await this.aiService.generate(prompt);
  const entries = parseModelJson(response.text);

  // Deactivate any previous active plan before creating the new one.
  await this.prisma.studyPlan.updateMany({
    where: { userId, active: true },
    data: { active: false },
  });

  const plan = await this.prisma.studyPlan.create({
    data: {
      userId,
      subject,
      examDate: examDate ? new Date(examDate) : null,
      daysAvailable,
      hoursPerDay,
      entries: entries as any,
      active: true,
    },
  });

  return { plan, truncated: response.truncated ?? false };
}

async getCurrentStudyPlan(userId: string) {
  const plan = await this.prisma.studyPlan.findFirst({
    where: { userId, active: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!plan) return { plan: null, todayEntry: null, dayNumber: null };

  const msPerDay = 24 * 60 * 60 * 1000;
  const dayNumber = Math.floor((Date.now() - plan.startDate.getTime()) / msPerDay) + 1;

  const entries = plan.entries as any[];
  const todayEntry = entries.find((e) => e.day === dayNumber) ?? null;

  return { plan, todayEntry, dayNumber };
}

async listStudyPlans(userId: string) {
  return this.prisma.studyPlan.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}



  // ─── Fallback: render scanned PDF pages as images and OCR them ────
private async ocrScannedPdf(buffer: Buffer): Promise<{ text: string; truncated: boolean; totalPages: number }> {
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true });
  const pdf = await loadingTask.promise;

  const pageLimit = 10; // OCR is slow per-page; keep this lower than the text-extraction cap
  const pagesToRead = Math.min(pdf.numPages, pageLimit);
  const textParts: string[] = [];

  for (let i = 1; i <= pagesToRead; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // higher scale = better OCR accuracy
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    await page.render({
  canvasContext: context as any,
  viewport,
  canvas: canvas as any,
}).promise;
    const imageBuffer = canvas.toBuffer('image/png');

    const ocrResult = await this.ocrService.extractText(imageBuffer);
    if (ocrResult.text?.trim()) {
      textParts.push(`[Page ${i}]\n${ocrResult.text}`);
    }
  }

  return {
    text: textParts.join('\n\n'),
    truncated: pdf.numPages > pageLimit,
    totalPages: pdf.numPages,
  };
}

private async saveGeneration(userId: string, tool: string, title: string | undefined, input: any, result: any) {
  return this.prisma.aiGeneration.create({
    data: { userId, tool, title: title?.slice(0, 80), input, result },
  });
}

async listGenerations(userId: string, tool: string) {
  return this.prisma.aiGeneration.findMany({
    where: { userId, tool },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, createdAt: true },
  });
}

async getGeneration(userId: string, id: string) {
  const gen = await this.prisma.aiGeneration.findFirst({ where: { id, userId } });
  if (!gen) throw new NotFoundException('Generation not found.');
  return gen;
}
}