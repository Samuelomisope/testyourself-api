import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

@Injectable()
export class AiService {
  private groq: Groq;
  private anthropic: Anthropic;

  constructor(private readonly prisma: PrismaService) {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // ─── Extract text from PDF buffer using pdfjs-dist ───────────────
  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const uint8Array = new Uint8Array(buffer);
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true });
      const pdf = await loadingTask.promise;

      const textParts: string[] = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => item.str)
          .join(' ')
          .trim();
        if (pageText) textParts.push(`[Page ${i}]\n${pageText}`);
      }

      return textParts.join('\n\n');
    } catch (err) {
      console.error('PDF text extraction failed:', err);
      return '';
    }
  }

  // ─── Groq: text + image ───────────────────────────────────────────
  private async askGroq(
    system: string,
    prompt: string,
    imageData?: string,
    imageMediaType?: string,
  ): Promise<string> {
    const userContent: any[] = [];

    if (imageData && imageMediaType) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${imageMediaType};base64,${imageData}` },
      });
    }

    userContent.push({ type: 'text', text: prompt });

    const response = await this.groq.chat.completions.create({
      model: imageData ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile',
      max_tokens: 2000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: imageData ? userContent : prompt },
      ],
    });

    return response.choices[0].message.content ?? '';
  }

  // ─── Claude: PDF ──────────────────────────────────────────────────
  private async askClaude(
    system: string,
    prompt: string,
    fileData: string,
    fileMimeType: string,
  ): Promise<string> {
    try {
      const contentBlock: any = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: fileData },
      };

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
      });

      const block = response.content[0];
      return block.type === 'text' ? block.text : '';
    } catch (err) {
      console.error('Claude failed, falling back to Groq:', err);
      return this.askGroq(
        system,
        `${prompt}\n\n[Note: A PDF was provided but could not be processed. Answer based on the question only.]`,
      );
    }
  }

  // ─── Router: picks Claude (PDF) or Groq (text/image) ─────────────
  private async ask(
    system: string,
    prompt: string,
    fileData?: string,
    fileMimeType?: string,
  ): Promise<string> {
    if (fileData && fileMimeType) {
      const isPdf = fileMimeType === 'application/pdf' || fileMimeType === 'pdf';
      if (isPdf) return this.askClaude(system, prompt, fileData, fileMimeType);
      if (fileMimeType.startsWith('image/')) return this.askGroq(system, prompt, fileData, fileMimeType);
    }
    return this.askGroq(system, prompt);
  }

  // ─── Features ─────────────────────────────────────────────────────
  async generateQuiz(
    text: string,
    count: number = 5,
    difficulty: string = 'Medium',
    fileData?: string,
    fileMimeType?: string,
  ) {
    const isPdf = fileMimeType === 'application/pdf' || fileMimeType === 'pdf';
    const fileType = fileMimeType?.startsWith('video/') ? 'video' :
      isPdf ? 'PDF' :
      fileMimeType?.startsWith('image/') ? 'image' : 'text';

    const prompt = `You are given a ${fileType} document. Read it carefully and generate ${count} ${difficulty} multiple choice questions based ONLY on the specific content, facts, terms, and concepts found in this document. Do NOT generate generic questions. Every question must reference something explicitly stated in the document.

Return ONLY a valid JSON array. Format:
[{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A. ..."}]

${text ? `Content:\n${text}` : ''}`;

    const raw = await this.ask(
      'You are TESTYOURSELF AI. Generate quiz questions STRICTLY from the provided document content only. Never generate generic study tips or meta questions. Return only raw JSON arrays with no markdown backticks, no explanation.',
      prompt,
      fileData,
      fileMimeType,
    );

    const questions = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return { questions };
  }

  // ─── Generate quiz from a library material ────────────────────────
  async generateQuizFromMaterial(
    materialId: string,
    count: number = 5,
    difficulty: string = 'Medium',
    signedUrl?: string,
  ) {
    const material = await this.prisma.studyMaterial.findUnique({
      where: { id: materialId },
    });

    if (!material) throw new NotFoundException('Study material not found.');

    const isPdf = material.fileType === 'application/pdf' || material.fileType === 'pdf';
    if (!isPdf) throw new BadRequestException('Only PDF materials are supported for quiz generation.');

    const fetchUrl = signedUrl ?? material.fileUrl;

    const response = await fetch(fetchUrl);
    console.log('Fetching URL:', fetchUrl);
    console.log('Response status:', response.status);

    if (!response.ok) throw new BadRequestException('Could not fetch the study material file.');

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log('Buffer size:', buffer.length);

    const extractedText = await this.extractPdfText(buffer);
    console.log('Extracted text length:', extractedText.length);

    if (extractedText && extractedText.length > 100) {
      return this.generateQuiz(extractedText, count, difficulty);
    } else {
      throw new BadRequestException(
        'This PDF appears to be scanned and has no readable text. Please upload a text-based PDF or paste the content manually.'
      );
    }
  }

  async askQuestion(
    question: string,
    fileData?: string,
    fileMimeType?: string,
  ) {
    const answer = await this.ask(
      'You are TESTYOURSELF AI, a friendly and smart study assistant. Answer student questions clearly and concisely. Use simple language. If explaining a concept, give a short example. If a file is provided, analyze and explain it in detail.',
      question || 'Please explain what you see in this file.',
      fileData,
      fileMimeType,
    );
    return { answer };
  }

  async summarize(
    text: string,
    style: string = 'Bullet points',
    fileData?: string,
    fileMimeType?: string,
  ) {
    const fileType = fileMimeType?.startsWith('video/') ? 'video content' :
      fileMimeType === 'application/pdf' || fileMimeType === 'pdf' ? 'PDF content' :
      fileMimeType?.startsWith('image/') ? 'image content' : 'notes';

    const prompt = `Summarize the following ${fileType} as "${style}". Be concise and clear.

${text ? `Notes:\n${text}` : ''}`;

    const summary = await this.ask(
      'You are TESTYOURSELF AI, a study assistant. Summarize study material clearly and concisely for students. For bullet points, use • as the bullet character.',
      prompt,
      fileData,
      fileMimeType,
    );
    return { summary };
  }

  async generateFlashcards(
    text?: string,
    count: number = 10,
    fileData?: string,
    fileMimeType?: string,
  ) {
    const isPdf = fileMimeType === 'application/pdf' || fileMimeType === 'pdf';
    const fileType = fileMimeType?.startsWith('video/') ? 'video' :
      isPdf ? 'PDF' :
      fileMimeType?.startsWith('image/') ? 'image' : 'text';

    const prompt = `Generate ${count} flashcards from this ${fileType}.
Return ONLY a valid JSON array. Format:
[{"front":"...","back":"..."}]

${text ? `Text: ${text}` : ''}`;

    const raw = await this.ask(
      'You are TESTYOURSELF AI, a study assistant. Return only raw JSON arrays with no markdown backticks, no explanation.',
      prompt,
      fileData,
      fileMimeType,
    );

    const flashcards = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return { flashcards };
  }
}