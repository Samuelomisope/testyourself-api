import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';

@Injectable()
export class AiService {
  private client: Groq;

  constructor() {
    this.client = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  private async ask(
    system: string,
    prompt: string,
    imageData?: string,
    imageMediaType?: string,
  ): Promise<string> {
    // Build user message content
    const userContent: any[] = [];

    // If image is attached, add it first
    if (imageData && imageMediaType) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${imageMediaType};base64,${imageData}`,
        },
      });
    }

    // Add the text prompt
    userContent.push({
      type: 'text',
      text: prompt,
    });

    const response = await this.client.chat.completions.create({
      // Use vision model when image is present, standard model otherwise
      model: imageData ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile',
      max_tokens: 1000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: imageData ? userContent : prompt },
      ],
    });

    return response.choices[0].message.content ?? '';
  }

  async generateQuiz(
    text: string,
    count: number = 5,
    difficulty: string = 'Medium',
    imageData?: string,
    imageMediaType?: string,
  ) {
    const prompt = `Generate ${count} ${difficulty} multiple choice questions from this ${imageData ? 'image' : 'text'}.
Return ONLY a valid JSON array. Format:
[{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A. ..."}]

${text ? `Text: ${text}` : ''}`;

    const raw = await this.ask(
      'You are TESTYOURSELF AI, a study assistant. Return only raw JSON arrays with no markdown backticks, no explanation.',
      prompt,
      imageData,
      imageMediaType,
    );

    const questions = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return { questions };
  }

  async askQuestion(
    question: string,
    imageData?: string,
    imageMediaType?: string,
  ) {
    const answer = await this.ask(
      'You are TESTYOURSELF AI, a friendly and smart study assistant. Answer student questions clearly and concisely. Use simple language. If explaining a concept, give a short example. If an image is provided, describe and explain it in detail.',
      question || 'Please explain what you see in this image.',
      imageData,
      imageMediaType,
    );
    return { answer };
  }

  async summarize(
    text: string,
    style: string = 'Bullet points',
    imageData?: string,
    imageMediaType?: string,
  ) {
    const prompt = `Summarize the following ${imageData ? 'image content' : 'notes'} as "${style}". Be concise and clear.

${text ? `Notes:\n${text}` : ''}`;

    const summary = await this.ask(
      'You are TESTYOURSELF AI, a study assistant. Summarize study material clearly and concisely for students. For bullet points, use • as the bullet character.',
      prompt,
      imageData,
      imageMediaType,
    );
    return { summary };
  }
}