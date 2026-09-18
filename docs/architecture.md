# Architecture

MERN prototype: React (Vite) → Express API → Mongoose (MongoDB) + in-process job queue → mock-local AI provider. No external keys required; Atlas URI optional, else `mongodb-memory-server` for zero-setup dev.

```mermaid
flowchart TB
  FE[React Vite: Home/Spaces/Project/Admin] --> API[Express API + auth + projectScope]
  API --> SVC[Services: retrieval, aiProvider, learning, jobs, observability]
  SVC --> DB[(MongoDB: Users Spaces Projects Materials Chunks Concepts Messages Quizzes Events Recs LearnCtx AIUsage Jobs)]
  SVC --> Q[In-process queue: queued/processing/done/failed + retry x3 + idempotency]
  Q --> PDF[pdf-parse → 800-char chunks + page estimate → concepts]
  SVC --> AI[mock-local-1.0 provider: tutor/quiz/grade — replaceable via generate()]
```

## Decisions
- **Monorepo + workspaces** (`client/`, `server/`): one clone, one demo.
- **Owner checks in middleware** (`projectScope`): every project route verifies `ownerId`; retrieval queries are project-scoped so no cross-project leak (tested).
- **Spec-compatible aliases** (`routes/compat.js`): canonical routes stay stable for the built UI; `/api/projects/:id/*` aliases satisfy the required API contract.
- **In-process queue, not BullMQ/Redis**: same job states/retries/idempotency without extra infra; swap `enqueue()` for BullMQ later.
- **TF-IDF retrieval, not vectors**: zero-config, explainable, page citations; swap `retrieval.js` for Atlas Vector Search later.
- **EMA mastery** (`learning.js`): `new = old*0.4 + target*0.6`, history kept for growth trends.
- **Stateless JWT** (`user`/`admin` roles); admin router guarded by `admin`.

## Data model
User → Space → Project → {Material → Chunk, Concept(mastery+history), Message(citations), Quiz(items/answers), Rec, LearnCtx(weakness/mistakes), Event, AIUsage, Job}. All timestamped; indexes on `ownerId`/`projectId` lookups.
