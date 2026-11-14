# AI Classroom configuration

The classroom endpoints fail closed: if a quota variable below is missing, invalid, or less than 1,
every upload and tutor turn returns `503 Classroom quota policy is not configured (<NAME>)`.
Set all six on every environment (staging and production) before using the feature.

| Variable | Meaning |
| --- | --- |
| `CLASSROOM_FREE_DAILY_TURNS` | Tutor turns per UTC day for free users |
| `CLASSROOM_PREMIUM_DAILY_TURNS` | Tutor turns per UTC day for active premium users |
| `CLASSROOM_FREE_DAILY_UPLOAD_BYTES` | Uploaded bytes per UTC day for free users |
| `CLASSROOM_PREMIUM_DAILY_UPLOAD_BYTES` | Uploaded bytes per UTC day for active premium users |
| `CLASSROOM_FREE_MAX_DOCUMENTS_PER_SESSION` | Documents (uploads + linked library material) per lesson, free |
| `CLASSROOM_PREMIUM_MAX_DOCUMENTS_PER_SESSION` | Documents per lesson, premium |

Optional:

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLASSROOM_MAX_EXTRACTED_CHARS` | `100000` | Text kept per document (minimum `12000`). Only the best-matching excerpts are sent to the model, so this does not change prompt size. Documents longer than this are cut, and `GET /classroom/sessions/:id/documents` reports `truncated: true` for them. |

The unit tests use 20 / 100 turns, 1,000,000 / 5,000,000 bytes and 3 / 10 documents as placeholders only.
Choose real values to match the freemium policy.

## Behaviour notes

- A tutor turn that fails (provider outage, unparseable response) is refunded to the day it was admitted on, so retrying does not cost an extra turn.
- Archived lessons are read-only: new turns, uploads and library links return `409`.
- The turn lease is 120 s because `AIService` can take up to about 80 s (two providers x two attempts x 20 s timeout) before giving up.