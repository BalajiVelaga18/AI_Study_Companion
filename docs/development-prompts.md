# Development Prompts (material AI-tool usage)

Organized by area; paraphrased from the actual build session.

- **Architecture**: "Design a MERN monorepo for a learning workspace: spaces→projects→materials→tutor→quiz→mastery→admin. Keep provider replaceable, jobs retryable, retrieval project-scoped."
- **Backend**: "Express + Mongoose models for User/Space/Project/Material/Chunk/Concept/Message/Quiz/Event/AIUsage/Job/Rec/LearnCtx with owner isolation; projectScope middleware."
- **Auth**: "JWT + bcrypt, user/admin roles, /me + logout, never return passwordHash."
- **PDF pipeline**: "multer PDF-only 25MB → queued → pdf-parse → 800-char chunks with page estimate → TF-IDF tokens → concept upsert → ready/failed + events."
- **RAG/Tutor**: "Project-scoped top-4 retrieval with score threshold; grounded answer + page citations; explicit unsupported response; sanitize untrusted text."
- **Quiz**: "Adaptive pick of lowest-mastery concepts, MCQ+open mix, strip correctIndex before send; open grading returns covered/missing/feedback; EMA mastery update."
- **Frontend**: "React Router pages for login/register, dashboard, spaces, project tabs (materials/tutor/quiz/mastery/growth/analytics), admin; loading/empty/error states; polling for job status."
- **Testing/eval**: "node:test unit checks (isolation, unsupported, adaptive, grading) + rule-based eval script with 4 gates."
- **Docs**: "README demo loop, architecture mermaid, AI architecture, evaluation, honest limitations."
