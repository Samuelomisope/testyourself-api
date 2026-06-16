import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
  private groq: Groq;
  private gemini: GoogleGenerativeAI;

  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
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
      max_tokens: 1000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: imageData ? userContent : prompt },
      ],
    });

    return response.choices[0].message.content ?? '';
  }

  // ─── Gemini: PDF + video ──────────────────────────────────────────
 // ─── Gemini: PDF + video ──────────────────────────────────────────
private async askGemini(
  system: string,
  prompt: string,
  fileData: string,
  fileMimeType: string,
): Promise<string> {
  const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-8b'];

  for (const modelName of models) {
    try {
      const model = this.gemini.getGenerativeModel({
        model: modelName,
        systemInstruction: system,
      });
      const result = await model.generateContent([
        { inlineData: { data: fileData, mimeType: fileMimeType } },
        prompt,
      ]);
      return result.response.text();
    } catch (err: any) {
      if (err?.status === 429) continue;
      throw err;
    }
  }

  throw new Error('All Gemini models are rate-limited. Please try again later.');
}
  // ─── Router: picks Groq or Gemini based on file type ─────────────
  private async ask(
    system: string,
    prompt: string,
    fileData?: string,
    fileMimeType?: string,
  ): Promise<string> {
    if (!fileData || !fileMimeType) {
      return this.askGroq(system, prompt);
    }

    const isImage = fileMimeType.startsWith('image/');
    const isPdf = fileMimeType === 'application/pdf';
    const isVideo = fileMimeType.startsWith('video/');

    if (isImage) {
      return this.askGroq(system, prompt, fileData, fileMimeType);
    }

    if (isPdf || isVideo) {
      return this.askGemini(system, prompt, fileData, fileMimeType);
    }

    // Fallback: treat as text only
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
    const fileType = fileMimeType?.startsWith('video/') ? 'video' :
                     fileMimeType === 'application/pdf' ? 'PDF' :
                     fileMimeType?.startsWith('image/') ? 'image' : 'text';

    const prompt = `Generate ${count} ${difficulty} multiple choice questions from this ${fileType}.
Return ONLY a valid JSON array. Format:
[{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A. ..."}]

${text ? `Text: ${text}` : ''}`;

    const raw = await this.ask(
      'You are TESTYOURSELF AI, a study assistant. Return only raw JSON arrays with no markdown backticks, no explanation.',
      prompt,
      fileData,
      fileMimeType,
    );

    const questions = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return { questions };
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
                     fileMimeType === 'application/pdf' ? 'PDF content' :
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
}