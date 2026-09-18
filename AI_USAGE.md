# AI usage
- To build: coding assistant (OpenCode/Muse Spark) for scaffold, debugging, docs.
- By product: `mock-local-1.0` — heuristic retrieval-grounded tutor, quiz generation, open-ended grading, concept extraction, rule-based evaluation. No external model calls; token/cost columns are estimates. Swap `server/src/services/aiProvider.js` to call OpenAI/Gemini while keeping citation + unsupported-handling contract.
