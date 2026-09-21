# Architecture (3–4 day prototype)

## Choice
MERN (Express + Mongoose + React Vite) per request. MongoDB via `MONGO_URI`, fallback to `mongodb-memory-server` for zero-setup dev. Local/mock AI so no keys are needed; provider abstraction allows OpenAI/Gemini later.

## Data model
User → Space → Project → {Material → Chunk, Concept(mastery+history), Message(citations), Quiz(items/answers), Rec, LearnCtx(weaknesses/mistakes), Event, AIUsage, Job}

## Key flows
- Upload PDF → `Material(queued)` → `enqueue(idempotencyKey)` → in-process worker → `processing` → pdf-parse → chunk 800c + page estimate → embeddings + TF-IDF tokens → concept upsert → `ready` (+ Event). Retry ×3 → `failed`.
- Tutor: question → project-scoped chunks only (isolation via `projectScope`) → Atlas Vector Search top-4 → score threshold → grounded answer + `Source: file — Page N` else explicit "insufficient evidence". Falls back to TF-IDF if vector search is unavailable. Log AIUsage(model, latency, tokens, cost).
- Quiz: `makeQuiz` picks lowest-mastery concepts first, mixes MCQ/open, avoids naive easy/hard flip. Open grading returns covered/missing + feedback. Each answer → EMA mastery update → weak-concept Rec + LearnCtx mistakes.
- Analytics: Events feed project/global/admin views. Admin guarded by `admin` middleware.

## Security / reliability
JWT auth, owner checks on every project route, multer PDF-only + size limit, zod validation, data-vs-instructions separation (sanitize + never execute material text), idempotent jobs/events, structured AI outputs validated before persist.

## Simplified / next
In-process queue (→ BullMQ), vector search (→ TF-IDF fallback), EMA mastery (→ BKT/IRT), no streaming yet, single-region uploads. See README demo loop.
