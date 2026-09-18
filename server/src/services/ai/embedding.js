// Embedding abstraction — independent of the text-generation provider.
// Modes (AI_EMBEDDINGS): auto (default) | gemini | mock | off
//   auto → real Gemini embeddings when AI_PROVIDER=gemini, otherwise off
//          (so mock mode behaves exactly as before: pure TF-IDF retrieval).
// Retrieval blends cosine similarity in ONLY when both query and chunk
// embeddings exist; otherwise it is pure TF-IDF (see retrieval.js).
const { tokens } = require('../retrieval');
const { isFallbackEligibleError } = require('./errors');

const MOCK_DIM = 64;

// Configured dimensions for supported embedding models.
// gemini-embedding-2 defaults to 3072, but this app configures it to 768 via
// outputDimensionality so the MongoDB Atlas Vector Search index stays small.
// The actual dimension is always confirmed from the API response when possible.
const EMBEDDING_DIMENSIONS = {
  'gemini-embedding-2': 768,
  'gemini-embedding-001': 768,
  'text-embedding-004': 768,
  'text-embedding-005': 768,
};

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Deterministic lexical hash vector: same text → same vector, related texts
// score higher. Offline, dependency-free; used for tests and as embedding fallback.
function mockEmbed(text) {
  const v = new Array(MOCK_DIM).fill(0);
  for (const t of tokens(String(text || ''))) v[hashStr(t) % MOCK_DIM] += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function mode() {
  const m = String(process.env.AI_EMBEDDINGS || 'auto').toLowerCase();
  if (m === 'auto') return (process.env.AI_PROVIDER || 'mock').toLowerCase() === 'gemini' ? 'gemini' : 'off';
  return ['gemini', 'mock', 'off'].includes(m) ? m : 'off';
}

function isEnabled() {
  return mode() !== 'off';
}

// Expected dimension for the currently configured embedding provider/model.
// gemini-embedding-2 is configured to 768 via outputDimensionality; the env
// var GEMINI_EMBEDDING_DIMENSION can override it. For mock/off it matches
// MOCK_DIM or returns null.
function expectedDimension() {
  const m = mode();
  if (m === 'off') return null;
  if (m === 'mock') return MOCK_DIM;
  if (process.env.GEMINI_EMBEDDING_DIMENSION) {
    const dim = Number(process.env.GEMINI_EMBEDDING_DIMENSION);
    if (dim > 0) return dim;
  }
  const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
  return EMBEDDING_DIMENSIONS[model] || null;
}

// Embedding configuration summary useful for Atlas Vector Search index setup.
function getEmbeddingConfig() {
  const m = mode();
  const model = m === 'gemini' ? (process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2') : null;
  return {
    provider: m === 'off' ? null : m,
    model,
    dimension: expectedDimension(),
    enabled: isEnabled(),
  };
}

// Best-effort: returns { vector, dim, provider } or null (never throws for
// provider faults — retrieval simply falls back to TF-IDF). Programming errors
// (empty text) still throw.
// Options: { allowFallback: true } — set to false to throw provider errors
// instead of silently falling back to mock embeddings.
async function generateEmbedding(text, options = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('text must be a non-empty string');
  const batch = await generateEmbeddings([text], options);
  return batch ? batch[0] : null;
}

// Batch embedding. Returns an array matching the input texts or null when
// embeddings are disabled. Falls back to mock embeddings for eligible provider
// faults (rate limits, quota, network, etc.) so material processing can still
// complete with TF-IDF-quality vectors.
// Options: { allowFallback: true } — set to false to throw provider errors
// instead of silently falling back to mock embeddings.
async function generateEmbeddings(texts, options = {}) {
  if (!Array.isArray(texts) || !texts.length) throw new Error('texts must be a non-empty array');
  const invalid = texts.find((t) => typeof t !== 'string' || !t.trim());
  if (invalid !== undefined) throw new Error('each text must be a non-empty string');
  const { allowFallback = true } = options;
  const m = mode();
  if (m === 'off') return null;
  if (m === 'mock') {
    return texts.map((text) => ({ vector: mockEmbed(text), dim: MOCK_DIM, provider: 'mock' }));
  }
  try {
    const gemini = require('./providers/gemini.provider');
    const r = await gemini.embedTexts(texts);
    const expected = expectedDimension();
    const out = r.vectors.map((v) => {
      if (expected && v.length !== expected) {
        console.warn(`[AI] embedding dimension mismatch: expected ${expected}, got ${v.length} for model ${r.model}`);
      }
      return { vector: v, dim: v.length, provider: 'gemini', model: r.model };
    });
    return out;
  } catch (e) {
    if (allowFallback && isFallbackEligibleError(e)) {
      const detail = String(e.message || '').replace(/\s+/g, ' ').slice(0, 160);
      console.log(`[AI] batch embedding provider=gemini ok=false category=${e.category} detail=${detail} — using mock embeddings`);
      return texts.map((text) => ({ vector: mockEmbed(text), dim: MOCK_DIM, provider: 'mock', fallbackUsed: true }));
    }
    throw e;
  }
}

// Verify the actual dimension by making a real test call. Requires a valid API
// key when in gemini mode. Returns { ok, dimension, model, error? }.
async function verifyDimension() {
  const cfg = getEmbeddingConfig();
  if (!cfg.enabled) return { ok: false, dimension: null, model: cfg.model, error: 'embeddings disabled' };
  try {
    const r = await generateEmbedding('verification test');
    if (!r || !r.vector || !r.vector.length) return { ok: false, dimension: null, model: r?.model, error: 'empty embedding returned' };
    const expected = expectedDimension();
    const ok = !expected || r.dim === expected;
    return { ok, dimension: r.dim, model: r.model || cfg.model, error: ok ? null : `dimension mismatch: expected ${expected}, got ${r.dim}` };
  } catch (e) {
    return { ok: false, dimension: null, model: cfg.model, error: String(e.message || e) };
  }
}

module.exports = {
  generateEmbedding,
  generateEmbeddings,
  mockEmbed,
  cosine,
  isEnabled,
  mode,
  MOCK_DIM,
  EMBEDDING_DIMENSIONS,
  expectedDimension,
  getEmbeddingConfig,
  verifyDimension,
};
