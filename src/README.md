# AIAssistantModule — "Ask UniLib" (M1)

Drop this `ai-assistant/` folder into `testyourself-api-fresh/src/`.

## Folder structure

```
src/
└── ai-assistant/
    ├── ai-assistant.module.ts
    ├── ai-assistant.controller.ts
    ├── ai-assistant.service.ts
    ├── prisma-schema-addition.prisma      (copy into schema.prisma, not a real file to drop in)
    ├── dto/
    │   ├── ask-unilib.dto.ts
    │   └── ask-unilib-response.dto.ts
    ├── enums/
    │   └── content-type.enum.ts
    ├── prompts/
    │   └── content-type-prompts.ts
    └── services/
        ├── content-type-classifier.service.ts
        └── ask-unilib-storage.service.ts
```

## Before this will compile

1. **Prisma**: copy the contents of `prisma-schema-addition.prisma` into your real `schema.prisma`, add the reverse relation on `User`, then run your existing `npx prisma db push` workflow.
2. **Two import paths need adjusting** to match your actual repo layout — both are flagged with comments:
   - `ai-assistant.service.ts` → `PrismaService` import path
   - `ai-assistant.controller.ts` → `JwtAuthGuard` and `CurrentUser` import paths
3. **Install the R2 SDK** if not already present: `npm install @aws-sdk/client-s3`
4. **Env vars** (in addition to the ones from ProviderModule's README):
   ```
   R2_BUCKET_NAME=...
   R2_PUBLIC_BASE_URL=https://your-r2-public-domain
   R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
   R2_ACCESS_KEY=...
   R2_SECRET_KEY=...
   ```
   If you already have an R2 upload service elsewhere in the repo, swap `AskUniLibStorageService` out for that instead — this one is intentionally self-contained so it doesn't block on finding/refactoring the existing script.
5. **Register the module**: import `AIAssistantModule` into `AppModule` (replace the earlier smoke-test `ProviderModule` import in `AppModule` with this, since `AIAssistantModule` already imports `ProviderModule` itself).

## How a request flows

```
POST /ai/ask  (multipart: image file + optional "question" text field)
  │
  ├─ 1. Validate file type/size (controller)
  ├─ 2. Upload image to R2, create AskUniLibQuery row (status: PROCESSING)
  ├─ 3. OCRService.extractText(image)              — Google Vision → Tesseract fallback
  ├─ 4. ContentTypeClassifierService.detect(image)  — separate, cheap classification call
  ├─ 5. buildPromptForContentType(...)              — routes to one of 7 prompt templates
  ├─ 6. AIService.understandImage(image, prompt)    — Claude → Groq fallback, never throws
  └─ 7. Update AskUniLibQuery row (status: COMPLETED), return AskUniLibResponseDto
```

If anything after step 2 throws, the row is marked FAILED and the student gets an honest
"something went wrong, try again" message — never a fabricated answer. The image itself
is never lost since it's saved before any AI call happens.

## Testing it manually

```bash
curl -X POST http://localhost:3000/ai/ask \
  -H "Authorization: Bearer <your JWT>" \
  -F "image=@/path/to/test-question.jpg" \
  -F "question=Can you explain this?"
```

## What's intentionally deferred

- Image preprocessing (rotation/deskew/contrast/resolution/noise reduction) — not wired in yet.
  `OCRService.extractText()` is the natural place to add a preprocessing step before the buffer
  reaches the OCR provider; can slot in as its own service without touching this module's API.
- The `AskUniLibModal` frontend component (Section 8) — separate piece, backend is ready to serve it.
- Rate limiting / free-vs-paid quotas (Section 11) — not enforced yet; add a guard before this ships.
