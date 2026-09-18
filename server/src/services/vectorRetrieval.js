// MongoDB Atlas Vector Search retrieval.
//
// Requirements:
//   - MongoDB Atlas cluster (M10+/serverless) with a Vector Search index on Chunk.embedding
//   - Index fields: vector path="embedding" numDimensions=768 similarity="cosine"
//   - Filter field: "projectId"
//
// Local/community MongoDB does NOT support $vectorSearch. The code detects this
// and throws VECTOR_SEARCH_UNAVAILABLE so callers can fall back to TF-IDF.
const mongoose = require('mongoose');
const { Chunk } = require('../models');
const embedding = require('./ai/embedding');
const { tokens } = require('./retrieval');

const VECTOR_INDEX_NAME = process.env.VECTOR_SEARCH_INDEX || 'chunk_vector_index';
const VECTOR_NUM_CANDIDATES = Math.max(10, Number(process.env.VECTOR_NUM_CANDIDATES || 100));
const EVIDENCE_STRONG_SCORE = Number(process.env.VECTOR_EVIDENCE_STRONG_SCORE || 0.75);
const EVIDENCE_MODERATE_SCORE = Number(process.env.VECTOR_EVIDENCE_MODERATE_SCORE || 0.5);

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

function isVectorMode() {
  return String(process.env.RETRIEVAL_MODE || 'tfidf').toLowerCase() === 'vector';
}

function isConfigured() {
  return isVectorMode() && embedding.isEnabled();
}

// User-safe error wrapping. Never leaks stack traces or internals.
function classifyVectorError(err) {
  const msg = String(err.message || err);
  if (msg.includes('$vectorSearch') || msg.includes('Unrecognized pipeline stage') || msg.includes('not supported')) {
    return new Error('VECTOR_SEARCH_UNAVAILABLE: $vectorSearch is not supported on this MongoDB deployment. Use MongoDB Atlas Vector Search.');
  }
  if (msg.includes('index') || msg.includes('SearchIndex') || msg.includes('vectorSearch')) {
    return new Error(`VECTOR_SEARCH_UNAVAILABLE: vector search index '${VECTOR_INDEX_NAME}' may be missing, not ready, or misconfigured.`);
  }
  if (msg.includes('dimension')) {
    return new Error(`VECTOR_SEARCH_UNAVAILABLE: ${msg}`);
  }
  return new Error(`VECTOR_SEARCH_UNAVAILABLE: ${msg.slice(0, 200)}`);
}

// Build the $vectorSearch aggregation pipeline stage.
function buildVectorSearchStage(queryVector, projectId, k) {
  const pid = toObjectId(projectId);
  const stage = {
    index: VECTOR_INDEX_NAME,
    path: 'embedding',
    queryVector,
    numCandidates: Math.max(k * 10, VECTOR_NUM_CANDIDATES),
    limit: k,
  };
  if (pid) {
    stage.filter = { projectId: { $eq: pid } };
  }
  return { $vectorSearch: stage };
}

// Generate a query embedding, validating dimension.
async function generateQueryEmbedding(question) {
  const emb = await embedding.generateEmbedding(question);
  if (!emb || !emb.vector || !emb.vector.length) {
    throw new Error('VECTOR_SEARCH_UNAVAILABLE: query embedding generation returned empty result');
  }
  const expectedDim = embedding.expectedDimension();
  if (expectedDim && emb.vector.length !== expectedDim) {
    throw new Error(`VECTOR_SEARCH_UNAVAILABLE: embedding dimension mismatch (expected ${expectedDim}, got ${emb.vector.length})`);
  }
  return emb.vector;
}

// Retrieve top-k chunks for a project using Atlas Vector Search.
// Returns hits in the same shape as TF-IDF retrieve(): [{ chunk, score, lex }].
async function search({ projectId, question, queryEmbedding = null, k = 4 }) {
  if (!projectId) throw new Error('projectId is required');
  if (typeof question !== 'string' || !question.trim()) throw new Error('question is required');
  if (!isConfigured()) {
    throw new Error('VECTOR_SEARCH_UNAVAILABLE: RETRIEVAL_MODE=vector and AI_EMBEDDINGS must be enabled');
  }

  const vector = queryEmbedding || (await generateQueryEmbedding(question));

  try {
    const results = await Chunk.aggregate([
      buildVectorSearchStage(vector, projectId, k),
      { $addFields: { score: { $meta: 'vectorSearchScore' } } },
      {
        $project: {
          ownerId: 1,
          projectId: 1,
          materialId: 1,
          filename: 1,
          page: 1,
          pageNumber: 1,
          text: 1,
          chunkIndex: 1,
          tokens: 1,
          embedding: 1,
          score: 1,
        },
      },
    ]);

    return results.map((r) => ({
      chunk: r,
      score: Number(r.score) || 0,
      lex: 0, // lexical component not used in pure vector retrieval
    }));
  } catch (e) {
    throw classifyVectorError(e);
  }
}

// Evidence bar for vector retrieval. Atlas scores are normalized (higher = better).
// We accept either a strong vector score or a moderate score with some lexical
// overlap. These defaults are conservative starting points — tune with real data.
function meetsEvidenceBar(question, hits) {
  if (!hits || !hits.length) return false;
  const top = hits[0];
  const score = top.score || 0;
  const qterms = new Set(tokens(question));
  const topTerms = new Set(top.chunk.tokens || tokens(top.chunk.text || ''));
  const overlap = [...qterms].filter((t) => topTerms.has(t)).length;

  if (score >= EVIDENCE_STRONG_SCORE) return true;
  if (score >= EVIDENCE_MODERATE_SCORE && overlap >= 1) return true;
  if (overlap >= 2) return true;
  return false;
}

// Best-effort probe: try a tiny $vectorSearch to see if the index is usable.
async function isAvailable() {
  if (!isConfigured()) return false;
  const expectedDim = embedding.expectedDimension();
  const dim = expectedDim || 768;
  try {
    await Chunk.aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector: new Array(dim).fill(0),
          numCandidates: 1,
          limit: 1,
        },
      },
      { $limit: 1 },
    ]);
    return true;
  } catch (e) {
    return false;
  }
}

// Returns the index definition that should be created in Atlas for the current
// embedding model. numDimensions matches the configured gemini-embedding-2
// outputDimensionality of 768.
function getIndexDefinition() {
  const dim = embedding.expectedDimension() || 768;
  return {
    name: VECTOR_INDEX_NAME,
    type: 'vectorSearch',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: dim, similarity: 'cosine' },
        { type: 'filter', path: 'projectId' },
      ],
    },
  };
}

module.exports = {
  search,
  meetsEvidenceBar,
  isConfigured,
  isAvailable,
  getIndexDefinition,
  VECTOR_INDEX_NAME,
};
