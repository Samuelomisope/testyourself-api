export interface RetrievedContext {
  chunks: Array<{
    materialId: string;
    materialTitle: string;
    courseId: string;
    chunkText: string;
    chunkIndex: number;
  }>;
}

export interface ClassificationInput {
  extractedText: string;
  fileName?: string;
  candidateOptions?: Record<string, string[]>; // e.g. { university: [...], course: [...] }
}

export interface ClassificationFieldResult<T = string> {
  value: T | null;
  confidence: number; // 0-100
}

export interface ClassificationResult {
  university: ClassificationFieldResult;
  school: ClassificationFieldResult;
  department: ClassificationFieldResult;
  programme: ClassificationFieldResult;
  level: ClassificationFieldResult;
  semester: ClassificationFieldResult;
  course: ClassificationFieldResult;
  materialType: ClassificationFieldResult;
  overallConfidence: number;
  reason: string;
}

export interface AIResponse {
  text: string;
  sources?: Array<{ materialId: string; materialTitle: string }>;
  isUncertain: boolean;
  truncated?: boolean;
  providerUsed: string;
  modelUsed: string;
}

/**
 * Every AI provider (Claude, Groq, Gemini, ...) implements this contract.
 * No provider-specific logic should exist outside the provider's own class.
 */
export interface AIProvider {
  readonly name: string;

  classify(input: ClassificationInput): Promise<ClassificationResult>;

  generate(prompt: string, context?: RetrievedContext): Promise<AIResponse>;

  understandImage(image: Buffer, question?: string, mimeType?: string): Promise<AIResponse>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');