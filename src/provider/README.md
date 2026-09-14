# ProviderModule

Drop this `provider/` folder into `testyourself-api-fresh/src/` and import
`ProviderModule` into any module that needs AI or OCR (e.g. the upcoming
`ClassificationModule`, `AIAssistantModule`).

## Install dependencies

```bash
npm install @anthropic-ai/sdk groq-sdk @google-cloud/vision tesseract.js
```

## Environment variables

```
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-sonnet-4-6            # optional, has default

GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile        # optional, has default
GROQ_VISION_MODEL=llama-3.2-11b-vision-preview  # optional, has default

# Either point to a service account file, or inline the JSON (e.g. as a
# Render secret). Never commit either to the repo.
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# or
GOOGLE_VISION_CREDENTIALS_JSON={"type":"service_account", ...}

# Optional — override provider priority order without a deploy once you
# want to A/B or fail over. Comma-separated, first = tried first.
AI_CLASSIFICATION_PROVIDER_CHAIN=claude,groq
AI_GENERATION_PROVIDER_CHAIN=claude,groq
AI_VISION_PROVIDER_CHAIN=claude,groq
OCR_PROVIDER_CHAIN=google-vision,tesseract
```

## Usage from another module

```ts
@Module({
  imports: [ProviderModule],
  providers: [AIAssistantService],
})
export class AIAssistantModule {}

@Injectable()
export class AIAssistantService {
  constructor(private readonly aiService: AIService, private readonly ocrService: OCRService) {}

  async askUniLib(image: Buffer, question?: string) {
    const ocrResult = await this.ocrService.extractText(image);
    return this.aiService.understandImage(image, question);
  }
}
```

## What's intentionally NOT here yet

- Admin-configurable provider chains (currently env-var only — spec allows
  this as the MVP, DB-backed table is a later refinement)
- Gemini is stubbed (throws) until it's actually needed
- Per-provider cost/usage tracking (belongs to the quota system in
  Section 11, not this module)

## Notes

- `AIService` and `OCRService` are the only things other modules should
  depend on. Never import a concrete provider class outside this folder.
- Every `AIResponse` carries `providerUsed` / `modelUsed` so callers can
  persist lineage (ties to `EvaluationRun`, `PredictionRecord`,
  `Material.classification_reason` per Section 5/2).
- `AIService.generate()` and `.understandImage()` never throw — on total
  failure they return an explicit "I'm not confident" `AIResponse` instead,
  per the roadmap's AI Failure & Low-Confidence Handling policy.