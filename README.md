# AI Study Companion — Candidate Prototype (MERN + Local/Mock AI)

Full learning loop: Space → Project → PDF Material → Background processing → Grounded Tutor + Citations → Unsupported handling → Adaptive Quiz (MCQ + open-ended) → Mastery → Growth → Recommendations → Analytics → Admin.

## Stack
- Backend: Node.js + Express + Mongoose (MongoDB)
- Frontend: React (Vite) + React Router
- AI: Local/Mock provider abstraction (`server/src/services/aiProvider.js`) — grounded TF-IDF retrieval, no external keys needed. Swap to OpenAI/Gemini by implementing `generate()` + `generateStructured()`.
- PDF: `pdf-parse` + chunking + TF-IDF retrieval with page citations
- Jobs: in-process async queue with states queued/processing/done/failed, retries ×3, idempotency keys
- Auth: JWT + bcrypt, `user` / `admin` roles, project-level isolation enforced in middleware (`projectScope`)

## Quick start
```bash
# 1. Mongo: use Atlas or docker
# docker-compose up mongo -d  (or set MONGO_URI)
cp .env.example .env
npm install
npm --workspace server run dev   # :4000
npm --workspace client run dev   # :5173
```

Seed an admin + demo user:
```bash
npm --workspace server run seed
# admin: admin@demo.local / admin123
# user:  user@demo.local / user123
```

## Demo loop (22-step interview flow)
1. Login (`/login`) → Create Space → Create Project (learning goal)
2. Upload PDF → watch status queued → processing → ready (polls every 4s)
3. Concepts appear after processing; Tutor: ask grounded question → `Source: <file> — Page N`
4. Ask off-topic → "not enough evidence" unsupported-handling
5. Quiz: Start → MCQ + open-ended → per-answer feedback → Complete → mastery bars + trend sparklines update
6. Growth tab → improving/stable/needs-attention; Recommendations → concrete "review pages X + re-quiz"
7. Analytics (project + global) + Activity feed; `/admin` as admin: users, journey, activity filters, AI usage, jobs, health, evaluation

## API (canonical + spec aliases)
Auth: `POST /api/auth/register|login|logout`, `GET /api/auth/me`
Spaces/Projects: `GET/POST /api/spaces`, `GET/PATCH/DELETE /api/spaces/:id`, `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`
Materials: `POST/GET /api/materials/:projectId/materials`, `GET /api/materials/:id`
Tutor: `POST /api/learn/:projectId/tutor` (alias `POST /api/projects/:id/tutor`), `GET .../messages|conversations`
Quiz: `POST .../quiz/start` (alias `POST /api/projects/:id/quiz`), `POST .../answer|complete` (aliases `/api/quizzes/:id/...`)
State: `GET /api/projects/:id/mastery|growth|recommendations|materials|analytics`, `GET /api/analytics/global`
Admin: `GET /api/analytics/admin/*` (aliases `/api/admin/*`) — overview, users, users/:id, activity, jobs

## AI Provider Architecture

Routes never call an AI SDK. They call `server/src/services/ai/service.js`:

```
Tutor/Quiz/Assessment route → aiService → primary provider → response
                                           ├─ gemini OK → { provider: "gemini" }
                                           └─ eligible failure + fallback=mock → { provider: "mock", fallbackUsed: true }
```

- **Mock provider** (`services/ai/providers/mock.provider.js`) — thin adapter over the original `services/aiProvider.js`, which is **unchanged**. Deterministic, offline, used for dev/tests.
- **Gemini provider** (`services/ai/providers/gemini.provider.js`) — the only file importing `@google/generative-ai`. JSON-mode structured outputs validated with zod before anything touches MongoDB; citations are mapped from retrieved-chunk metadata, never from model text. No-evidence questions short-circuit to the standard unsupported message without an LLM call.
- **Embeddings** (`services/ai/embedding.js`) — separate abstraction (`AI_EMBEDDINGS=auto|gemini|mock|off`; auto = real Gemini embeddings only when `AI_PROVIDER=gemini`, otherwise off so mock mode is pure TF-IDF). Retrieval blends cosine in only when embeddings exist on both sides.
- **Fallback rules** (`services/ai/errors.js`): quota/rate-limit/auth/timeout/network/server errors → Mock; programming errors (bad args, DB, authz) → real errors, never hidden. One retry for transient faults only, never for quota. Timeout via `AI_TIMEOUT_MS`.
- **Honesty**: every response carries `provider` + `fallbackUsed`; the Tutor UI shows a subtle "Fallback demo response" badge; Admin → AI usage shows `prov=` / `fallback` / `err=` per call. Nothing claims Gemini when Mock answered.
- **Failure demo**: `AI_PROVIDER=gemini AI_FALLBACK_PROVIDER=mock GEMINI_SIMULATE_FAILURE=true [GEMINI_SIMULATE_ERROR=quota_exceeded]` — full loop keeps working on Mock. All simulation is dev-only, default off.
- **Modes**: `mock/none` (dev, no key) · `gemini/none` (strict — failure returns 502 `ai_unavailable`) · `gemini/mock` (recommended demo). Key stays backend-only; client source contains no Gemini references.

## Retrieval modes

The Tutor supports two retrieval backends, selected via `RETRIEVAL_MODE`:

- **`tfidf`** (default) — local TF-IDF over project chunks. No Atlas required.
- **`vector`** — semantic retrieval with MongoDB Atlas Vector Search over `Chunk.embedding` (768-dim vectors from `gemini-embedding-2`), filtered by `projectId`. Falls back to TF-IDF if Atlas/index/embedding is unavailable.

New PDFs automatically get embeddings for all chunks. Existing chunks can be backfilled:

```bash
AI_EMBEDDINGS=gemini RETRIEVAL_MODE=vector npm --workspace server run backfill:embeddings
```

See `docs/ai-architecture.md` for the required Atlas Vector Search index definition.

## Docs

- `ARCHITECTURE.md`, `docs/architecture.md` — decisions, data model, flows (mermaid)
- `docs/ai-architecture.md` — RAG, context assembly, structured outputs, injection protection
- `docs/evaluation.md` + `npm --workspace server run eval` — tutor/retrieval/grading gates
- `docs/limitations.md` — honest constraints; `docs/development-prompts.md` — AI-tool prompts
- `AI_USAGE.md` — what AI builds vs what AI runs the product

## Your own MongoDB (Compass) + your own JWT secret

All data lives in whatever `MONGO_URI` points to. To use **your** database:

1. Open `.env` (root folder) and set your two values:
   - `MONGO_URI` — local: `mongodb://127.0.0.1:27017/ai_study_companion` (needs MongoDB installed & running), or paste your own Atlas URI.
   - `JWT_SECRET` — any long random string. Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Verify the app reaches it:
   ```bash
   npm --workspace server run verify
   ```
   You should see `connected. DB name: ai_study_companion` plus collection counts.
3. Open the **same URI** in MongoDB Compass → same database → collections `users, spaces, projects, materials, chunks, concepts, messages, quizzes, events, recs, aiusages, jobs`. Register a user / upload a PDF and watch rows appear live in Compass.
4. Seed demo logins (stored as bcrypt hashes — Compass shows `passwordHash`, never plaintext):
   ```bash
   npm --workspace server run seed
   # admin@demo.local / admin123, user@demo.local / user123
   ```

Notes: if `MONGO_URI` is empty the server uses a temporary in-memory DB (dev only — Compass will show nothing). If the URI is unreachable the server exits immediately with `db connect failed — check MONGO_URI in .env`. The server startup line always prints which DB it connected to. Never commit `.env`.

## Deployment
- Frontend: Vercel (`client/`; set `VITE_API` → backend URL; currently `lib/api.js` points at `http://localhost:4000`).
- Backend: Render/Railway/Fly (`server/`; env: `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`, `UPLOAD_DIR`).
- DB: MongoDB Atlas; uploads are local disk (move to S3 for multi-instance).
