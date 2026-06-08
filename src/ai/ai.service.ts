import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AiService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  private async ask(system: string, prompt: string): Promise<string> {
    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  }

  async generateQuiz(text: string, count: number = 5, difficulty: string = 'Medium') {
    const raw = await this.ask(
      'You are TESTYOURSELF AI, a study assistant. Return only raw JSON arrays with no markdown backticks, no explanation.',
      `Generate ${count} ${difficulty} multiple choice questions from this text.
Return ONLY a valid JSON array. Format:
[{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A. ..."}]

Text: ${text}`,
    );
    const questions = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return { questions };
  }

  async askQuestion(question: string) {
    const answer = await this.ask(
      'You are TESTYOURSELF AI, a friendly and smart study assistant. Answer student questions clearly and concisely. Use simple language. If explaining a concept, give a short example.',
      question,
    );
    return { answer };
  }

  async summarize(text: string, style: string = 'Bullet points') {
    const summary = await this.ask(
      'You are TESTYOURSELF AI, a study assistant. Summarize study material clearly and concisely for students. For bullet points, use • as the bullet character.',
      `Summarize the following notes as "${style}". Be concise and clear.\n\nNotes:\n${text}`,
    );
    return { summary };
  }
}
