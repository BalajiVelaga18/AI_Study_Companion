// AI Service — the ONLY entry point routes/controllers use for AI.
// Application → service → (gemini | mock). No route ever imports the SDK.
//
// Modes (env):
//   AI_PROVIDER=mock,   AI_FALLBACK_PROVIDER=none  → Mock only (dev/test, unchanged behavior)
//   AI_PROVIDER=gemini, AI_FALLBACK_PROVIDER=none  → Gemini only (failure = proper 502 error)
//   AI_PROVIDER=gemini, AI_FALLBACK_PROVIDER=mock  → Gemini + Mock fallback (recommended demo)
const mockProvider = require('./providers/mock.provider');
const geminiProvider = require('./providers/gemini.provider');
const retrievalService = require('../retrievalService');
const { retrieve, meetsEvidenceBar: tfidfMeetsEvidenceBar, unsupportedMessage, detectPageReference } = require('../retrieval');
const { snapshotText, composeWeaknessAnswer, hasLearningEvidence, detectIntent } = require('./context');
const { isFallbackEligibleError } = require('./errors');

function aiConfig() {
  const primary = String(process.env.AI_PROVIDER || 'mock').toLowerCase();
  let fallback = String(process.env.AI_FALLBACK_PROVIDER || '').toLowerCase();
  if (!fallback || fallback === 'undefined') fallback = primary === 'gemini' ? 'mock' : 'none';
  return {
    primary: primary === 'gemini' ? 'gemini' : 'mock',
    fallback: fallback === 'mock' ? 'mock' : 'none',
    model: geminiProvider.defaultModel(),
  };
}

function defaultModel() {
  return geminiProvider.defaultModel();
}

function log(...args) {
  console.log('[AI]', ...args); // never logs keys, passwords, or conversation bodies
}

// User-safe error text: category only, no stack traces, no internals.
function userSafeMessage(e) {
  if (isFallbackEligibleError(e)) return `AI provider temporarily unavailable (${e.category}).`;
  return 'AI request failed.';
}

async function runFeature(feature, { primary, fallback }) {
  const cfg = aiConfig();
  const t0 = Date.now();
  log(`feature=${feature} primary=${cfg.primary} fallback=${cfg.fallback}`);
  if (cfg.primary === 'mock' || !primary) {
    const r = await fallback();
    log(`feature=${feature} provider=mock ok=true latency=${Date.now() - t0}ms`);
    return { ...r, provider: 'mock', fallbackUsed: false, model: r.model || mockProvider.MODEL, latencyMs: Date.now() - t0 };
  }
  try {
    const r = await primary();
    log(`feature=${feature} provider=gemini ok=true latency=${Date.now() - t0}ms`);
    return { ...r, provider: 'gemini', fallbackUsed: false, model: r.model || cfg.model, latencyMs: Date.now() - t0 };
  } catch (e) {
    const eligible = isFallbackEligibleError(e);
    // Truncated provider message only (server-side text, never contains the key).
    const detail = String(e.message || '').replace(/\s+/g, ' ').slice(0, 200);
    log(`feature=${feature} provider=gemini ok=false category=${e.category || 'programming_error'} detail=${detail} latency=${Date.now() - t0}ms`);
    if (eligible && cfg.fallback === 'mock') {
      log(`feature=${feature} falling back to mock provider`);
      const r = await fallback();
      return { ...r, provider: 'mock', fallbackUsed: true, fallbackReason: e.category, model: r.model || mockProvider.MODEL, latencyMs: Date.now() - t0 };
    }
    throw e;
  }
}

// Deduplicate citations by file+page (boundary normalization; the frozen mock
// may cite the same source twice, the model may repeat indices).
function dedupeCitations(cites) {
  const seen = new Set();
  const out = [];
  for (const c of cites || []) {
    const key = `${c.filename}::${c.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ materialId: c.materialId, filename: c.filename, page: c.page });
  }
  return out;
}

// ---- Tutor: retrieval is shared; citations always come from DB chunk metadata ----
async function tutorResponse({ question, projectId, chunks, context = {} }) {
  if (typeof question !== 'string' || !question.trim()) throw new Error('question is required');
  const goal = context.goal;
  const intent = context.intent || detectIntent(question);

  // Weakness questions are answered from LEARNING STATE, not document retrieval.
  if (intent === 'weakness') return weaknessFlow({ snapshot: context.snapshot, goal });

  const pageRef = detectPageReference(question);

  // Retrieve relevant chunks. Production uses retrievalService (vector or TF-IDF);
  // the legacy `chunks` argument is kept for existing tests.
  let retrievalResult;
  if (projectId) {
    if (pageRef) {
      retrievalResult = await retrievalService.searchByPage({ projectId, page: pageRef, question });
    } else {
      retrievalResult = await retrievalService.search({ projectId, question, k: 4 });
    }
  } else {
    const list = Array.isArray(chunks) ? chunks : [];
    let queryEmbedding = null;
    try {
      const emb = require('./embedding');
      if (emb.isEnabled()) queryEmbedding = await emb.generateEmbedding(question);
    } catch { queryEmbedding = null; }
    const hits = retrieve(question, list, 4, queryEmbedding);
    retrievalResult = { method: 'tfidf', hits, chunks: list, fallbackUsed: false, fallbackReason: null };
  }

  const hits = retrievalResult.hits;
  log(`retrieval method=${retrievalResult.method}${retrievalResult.fallbackUsed ? ' (tfidf fallback)' : ''} hits=${hits.map((h) => `${+h.score.toFixed(2)}/p${h.chunk.page}`).join(',') || 'none'} intent=${intent}`);

  // Page-aware: explicit page reference with no matching chunks → immediate unsupported.
  if (pageRef && !hits.length) {
    const msg = `I don't have any content from page ${pageRef} in your project materials. Upload relevant material or rephrase within the scope of: ${goal || 'this project'}.`;
    if (aiConfig().primary === 'mock') {
      return { answer: msg, citations: [], grounded: false, provider: 'mock', fallbackUsed: false, fallbackReason: 'no_evidence', model: mockProvider.MODEL, latencyMs: 0, intent: 'page' };
    }
    return { answer: msg, citations: [], grounded: false, provider: 'mock', fallbackUsed: true, fallbackReason: 'no_evidence', model: mockProvider.MODEL, latencyMs: 0, intent: 'page' };
  }

  // Evidence gate. Vector mode uses vector scores; TF-IDF mode uses lexical overlap.
  if (!retrievalService.meetsEvidenceBar(question, retrievalResult)) {
    if (aiConfig().primary === 'mock') {
      return { answer: unsupportedMessage(goal), citations: [], grounded: false, provider: 'mock', fallbackUsed: false, model: mockProvider.MODEL, latencyMs: 0, intent };
    }
    return {
      answer: unsupportedMessage(goal), citations: [], grounded: false,
      provider: 'mock', fallbackUsed: true, fallbackReason: 'no_evidence',
      model: mockProvider.MODEL, latencyMs: 0, intent,
    };
  }

  const richContext = {
    ...context,
    goal,
    intent,
    snapshotText: snapshotText(context.snapshot),
  };

  // Provider calls use `hits` directly. Mock provider is updated to accept hits
  // when available, falling back to its legacy chunks interface for old callers.
  if (aiConfig().primary === 'mock') {
    return runFeature('tutor', {
      fallback: async () => {
        const r = await mockProvider.generateTutorResponse({ question, hits, chunks: retrievalResult.chunks, context: richContext });
        return { ...r, citations: dedupeCitations(r.citations), intent };
      },
    });
  }
  return runFeature('tutor', {
    primary: async () => {
      const g = await geminiProvider.generateTutorResponse({
        question,
        hits,
        context: {
          goal,
          weaknesses: context.weaknesses,
          history: context.history,
          summary: context.summary,
          snapshotText: snapshotText(context.snapshot),
          intent,
        },
      });
      if (g.insufficient || !g.answer) {
        return { answer: unsupportedMessage(goal), citations: [], grounded: false, intent };
      }
      // Map model-returned indices to REAL chunk metadata. Anything out of range
      // is dropped — the model can never invent a filename or page number.
      const mapped = [];
      for (const n of g.supports || []) {
        const h = hits[n - 1];
        if (!h) continue;
        mapped.push({ materialId: h.chunk.materialId, filename: h.chunk.filename, page: h.chunk.page });
      }
      const finalCites = dedupeCitations(mapped.length ? mapped : hits.map((h) => ({ materialId: h.chunk.materialId, filename: h.chunk.filename, page: h.chunk.page })));
      return {
        answer: g.answer, citations: finalCites, grounded: true, intent,
        inputTokens: g.inputTokens, outputTokens: g.outputTokens,
      };
    },
    fallback: async () => {
      const r = await mockProvider.generateTutorResponse({ question, hits, chunks: retrievalResult.chunks, context: richContext });
      return { ...r, citations: dedupeCitations(r.citations), intent };
    },
  });
}

// "What am I weak at?" — composed from the learning snapshot (mastery,
// mistakes, recent quizzes). Gemini may phrase it; the deterministic template
// is the fallback. Citations are [] — this is learning-state evidence, and the
// UI must not render document sources for it.
async function weaknessFlow({ snapshot, goal }) {
  if (!hasLearningEvidence(snapshot)) {
    const answer = 'I don\'t have enough learning evidence yet to judge your weak areas — no quizzes, assessments, or tracked mistakes in this project so far. Take a short quiz first, then ask me again.';
    return { answer, citations: [], grounded: false, basis: 'learning-context', provider: 'mock', fallbackUsed: aiConfig().primary !== 'mock', fallbackReason: 'no_evidence', model: mockProvider.MODEL, latencyMs: 0, intent: 'weakness' };
  }
  const template = composeWeaknessAnswer(snapshot, goal);
  if (aiConfig().primary === 'mock') {
    return runFeature('tutor', {
      fallback: async () => ({ answer: template, citations: [], grounded: true, basis: 'learning-context' }),
    }).then((r) => ({ ...r, intent: 'weakness' }));
  }
  return runFeature('tutor', {
    primary: async () => {
      const g = await geminiProvider.phraseWeakness({ snapshotText: snapshotText(snapshot), goal });
      return { answer: g.text, citations: [], grounded: true, basis: 'learning-context', inputTokens: g.inputTokens, outputTokens: g.outputTokens, intent: 'weakness' };
    },
    fallback: async () => ({ answer: template, citations: [], grounded: true, basis: 'learning-context', intent: 'weakness' }),
  });
}

async function generateQuiz({ chunks, mastery, history, n = 5 }) {
  const list = Array.isArray(chunks) ? chunks : [];
  const count = Math.min(8, Math.max(1, Number(n) || 5));
  const out = await runFeature('quiz', {
    primary: async () => {
      const concepts = [...(mastery || [])].sort((a, b) => a.mastery - b.mastery).slice(0, 6)
        .map((c) => ({ name: c.name, mastery: c.mastery }));
      const basis = concepts.length ? concepts : [{ name: 'general', mastery: 0.3 }];
      const evidence = list.slice(0, 8).map((c) => ({
        text: String(c.text || '').slice(0, 400),
        source: c.materialId ? { materialId: c.materialId, filename: c.filename, page: c.page } : null,
      }));
      const g = await geminiProvider.generateQuiz({ concepts: basis, evidence, n: count });
      return { items: g.items, inputTokens: g.inputTokens, outputTokens: g.outputTokens };
    },
    fallback: () => mockProvider.generateQuiz({ chunks: list, mastery: mastery || [], history: history || [], n: count })
      .then((items) => ({ items })),
  });
  return out;
}

async function evaluateAssessment({ prompt, rubric, answer, sourceText }) {
  if (!answer) throw new Error('answer is required');
  return runFeature('grade', {
    primary: () => geminiProvider.evaluateAssessment({ prompt, rubric, answer, sourceText }),
    fallback: () => mockProvider.evaluateAssessment({ prompt, rubric, answer, sourceText }),
  });
}

async function extractConcepts(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('text is required');
  const out = await runFeature('concepts', {
    primary: () => geminiProvider.extractConcepts(text).then((concepts) => ({ concepts })),
    fallback: () => mockProvider.extractConcepts(text).then((concepts) => ({ concepts })),
  });
  return out.concepts;
}

async function generateRecommendation(kind, payload = {}) {
  const out = await runFeature('recommend', {
    primary: () => geminiProvider.generateRecommendation(kind, payload).then((r) => ({ ...r })),
    fallback: () => mockProvider.generateRecommendation(kind, payload).then((r) => ({ ...r })),
  });
  return { text: out.text, reason: out.reason, provider: out.provider, fallbackUsed: out.fallbackUsed };
}

async function generateText(prompt) {
  return runFeature('text', {
    primary: () => geminiProvider.generateText(prompt),
    fallback: () => mockProvider.generateText(prompt),
  });
}

module.exports = {
  aiConfig,
  defaultModel,
  userSafeMessage,
  dedupeCitations,
  tutorResponse,
  generateQuiz,
  evaluateAssessment,
  extractConcepts,
  generateRecommendation,
  generateText,
};
