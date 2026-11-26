import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpeechResult, TtsProvider, TutorVoice } from './tts-provider';

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/speech';

/** Groq's Orpheus English voices. Model and voice names can be changed in Render without a deploy. */
@Injectable()
export class GroqTtsProvider implements TtsProvider {
  readonly name = 'groq';
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('GROQ_API_KEY')) && this.config.get<string>('CLASSROOM_SPEECH_ENABLED') !== 'false';
  }

  async synthesize(text: string, voice: TutorVoice, signal?: AbortSignal): Promise<SpeechResult> {
    const model = this.config.get<string>('GROQ_TTS_MODEL') || 'canopylabs/orpheus-v1-english';
    const voiceName = voice === 'male'
      ? this.config.get<string>('GROQ_TTS_VOICE_MALE') || 'troy'
      : this.config.get<string>('GROQ_TTS_VOICE_FEMALE') || 'hannah';
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.get<string>('GROQ_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, voice: voiceName, input: text, response_format: 'wav' }),
      signal: signal ?? AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Groq speech failed with status ${response.status}`);
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw new Error('Groq speech returned no audio');
    return { audio, contentType: 'audio/wav' };
  }
}
