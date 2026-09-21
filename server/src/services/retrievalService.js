// Retrieval abstraction: vector (MongoDB Atlas Vector Search) or tfidf.
// The Tutor calls this service rather than depending on MongoDB/TF-IDF details.
//
// Configuration:
//   RETRIEVAL_MODE=vector  → primary vector search, optional TF-IDF fallback (default)
//   RETRIEVAL_MODE=tfidf   → pure TF-IDF
const { Chunk } = require('../models');
const tfidf = require('./retrieval');
const vector = require('./vectorRetrieval');

function retrievalMode(explicitMode) {
  return String(explicitMode || process.env.RETRIEVAL_MODE || 'vector').toLowerCase();
}

async function maybeGenerateQueryEmbedding(question) {
  try {
    const embedding = require('./ai/embedding');
    if (embedding.isEnabled()) return await embedding.generateEmbedding(question);
  } catch {
    // TF-IDF works without embeddings; ignore failures here.
  }
  return null;
}

async function tfidfSearch({ projectId, question, k = 4 }) {
  const chunks = await Chunk.find({ projectId }).limit(200).lean();
  const queryEmbedding = await maybeGenerateQueryEmbedding(question);
  const hits = tfidf.retrieve(question, chunks, k, queryEmbedding);
  return { hits, chunks };
}

async function pageSearch({ projectId, page, question }) {
  const chunks = await Chunk.find({ projectId, $or: [{ page: Number(page) }, { pageNumber: Number(page) }] }).limit(50).lean();
  const hits = tfidf.retrieveByPage(page, chunks);
  return { hits, chunks };
}

// Search for the most relevant chunks in a project.
// Returns { method, hits, chunks?, fallbackUsed, fallbackReason }.
async function search({ projectId, question, k = 4, mode, allowFallback = true }) {
  if (!projectId) throw new Error('projectId is required');
  if (typeof question !== 'string' || !question.trim()) throw new Error('question is required');

  const m = retrievalMode(mode);
  const result = { method: m, hits: [], fallbackUsed: false, fallbackReason: null };

  if (m === 'vector') {
    try {
      result.hits = await vector.search({ projectId, question, k });
      return result;
    } catch (e) {
      const msg = String(e.message || e);
      if (allowFallback && msg.includes('VECTOR_SEARCH_UNAVAILABLE')) {
        console.log(`[retrieval] vector search unavailable, falling back to tfidf: ${msg.slice(0, 200)}`);
        const tfidfResult = await tfidfSearch({ projectId, question, k });
        result.fallbackUsed = true;
        result.fallbackReason = msg;
        result.method = 'tfidf';
        result.hits = tfidfResult.hits;
        result.chunks = tfidfResult.chunks;
        return result;
      }
      throw e;
    }
  }

  const tfidfResult = await tfidfSearch({ projectId, question, k });
  result.hits = tfidfResult.hits;
  result.chunks = tfidfResult.chunks;
  return result;
}

// Page-aware retrieval: explicit references like "page 5". Always uses TF-IDF
// because the user already narrowed the source to a specific page.
async function searchByPage({ projectId, page, question }) {
  if (!projectId) throw new Error('projectId is required');
  const { hits, chunks } = await pageSearch({ projectId, page, question });
  return { method: 'tfidf', hits, chunks, fallbackUsed: false, fallbackReason: null };
}

// Evidence bar dispatch. Vector mode uses vector scores; TF-IDF mode uses the
// existing lexical gate over the full project corpus.
function meetsEvidenceBar(question, searchResult) {
  const { method, hits, chunks } = searchResult || {};
  if (!hits || !hits.length) return false;
  if (method === 'vector') return vector.meetsEvidenceBar(question, hits);
  return tfidf.meetsEvidenceBar(question, hits, chunks || hits.map((h) => h.chunk));
}

function unsupportedMessage(goal) {
  return tfidf.unsupportedMessage(goal);
}

module.exports = {
  search,
  searchByPage,
  meetsEvidenceBar,
  unsupportedMessage,
  retrievalMode,
};
