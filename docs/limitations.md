# Known Limitations

- **Retrieval**: TF-IDF keyword overlap, no semantic vectors; paraphrased questions may miss. → Atlas Vector Search.
- **PDF parsing**: `pdf-parse` text-only; scanned/image PDFs yield little text (no OCR); tables/diagrams lost.
- **AI quality**: mock-local heuristics, not a real LLM — answers summarize chunks; no deep reasoning. Swap provider for quality.
- **Gemini mode**: needs `GEMINI_API_KEY` + network; quota/rate limits fall back to Mock (logged with category). Token/cost columns are heuristic estimates, not billing data.
- **Mastery**: EMA estimate, not psychometric (no BKT/IRT); cold-start 0.3 for all concepts.
- **Jobs**: in-process — lost on restart, single instance; no BullMQ/Redis yet.
- **Files**: local disk (`UPLOAD_DIR`), 25 MB PDF-only; no S3/object storage abstraction beyond path field.
- **Security**: JWT in localStorage (XSS-sensitive); no refresh rotation; rate limit is in-memory per instance.
- **Cost/latency**: AIUsage tokens are heuristic estimates (`len/4`), cost a placeholder rate.
- **Secrets**: root `.env` holds a real Atlas credential from development — **rotate it** and never commit `.env` (gitignored, but the value was shared in this workspace).
- **Scale**: admin aggregates are unpaginated (limit 100–200); analytics queries are simple finds, no caching.
