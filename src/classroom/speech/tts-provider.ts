export type TutorVoice = 'female' | 'male';

export interface SpeechResult {
  audio: Buffer;
  contentType: string;
}

/** A text-to-speech engine. Swappable: the service only talks to this interface. */
export interface TtsProvider {
  readonly name: string;
  /** False when the engine has no key or is switched off, so the app can fall back to the browser voice. */
  isConfigured(): boolean;
  synthesize(text: string, voice: TutorVoice, signal?: AbortSignal): Promise<SpeechResult>;
}

export const TTS_PROVIDER = Symbol('TTS_PROVIDER');
