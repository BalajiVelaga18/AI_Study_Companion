// Vector retrieval / embedding migration tests.
// These use mongodb-memory-server when MONGO_URI is unset, so no Atlas cluster
// is required for the TF-IDF fallback and embedding tests. Actual $vectorSearch
// paths are exercised only when an Atlas index is available.
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../src/config');
const { Chunk } = require('../src/models');
const embedding = require('../src/services/ai/embedding');
const retrievalService = require('../src/services/retrievalService');
const vectorRetrieval = require('../src/services/vectorRetrieval');
const aiService = require('../src/services/ai/service');

const ENV_KEYS = ['AI_PROVIDER', 'AI_FALLBACK_PROVIDER', 'AI_EMBEDDINGS', 'RETRIEVAL_MODE', 'GEMINI_API_KEY', 'GEMINI_SIMULATE_FAILURE'];
const savedEnv = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
function setEnv(o) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, o);
}
test.after(() => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, savedEnv); });

async function cleanChunks() {
  if (Chunk.collection) await Chunk.deleteMany({});
}

async function seedChunks(projectId) {
  const pid = new mongoose.Types.ObjectId(projectId);
  const mid = new mongoose.Types.ObjectId();
  const docs = [
    { projectId: pid, materialId: mid, filename: 'rag.pdf', page: 15, text: 'Retrieval augmented generation combines information retrieval with language model generation.' },
    { projectId: pid, materialId: mid, filename: 'rag.pdf', page: 16, text: 'Vector search uses embeddings to find semantically similar documents.' },
    { projectId: pid, materialId: mid, filename: 'rag.pdf', page: 17, text: 'TF-IDF scores terms based on frequency and inverse document frequency.' },
  ];
  return Chunk.insertMany(docs);
}

test.before(async () => {
  setEnv({ AI_PROVIDER: 'mock', AI_FALLBACK_PROVIDER: 'none', AI_EMBEDDINGS: 'mock', RETRIEVAL_MODE: 'tfidf' });
  await connectDB();
  await cleanChunks();
});

test.after(async () => {
  await cleanChunks();
  await closeDB();
});

// ---- embedding service ----

test('embedding: batch generation returns one vector per text', async () => {
  setEnv({ AI_PROVIDER: 'mock', AI_EMBEDDINGS: 'mock' });
  const out = await embedding.generateEmbeddings(['first text', 'second text']);
  assert.equal(out.length, 2);
  assert.ok(out[0].vector.length > 0);
  assert.equal(out[0].dim, out[0].vector.length);
  assert.equal(out[0].provider, 'mock');
});

test('embedding: gemini config reports gemini-embedding-2 dimension 768', () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'mock', AI_EMBEDDINGS: 'gemini' });
  const cfg = embedding.getEmbeddingConfig();
  assert.equal(cfg.provider, 'gemini');
  assert.equal(cfg.model, 'gemini-embedding-2');
  assert.equal(cfg.dimension, 768);
});

test('embedding: verifyDimension detects dimension mismatch when gemini falls back to mock', async () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'mock', AI_EMBEDDINGS: 'gemini', GEMINI_SIMULATE_FAILURE: 'true' });
  const v = await embedding.verifyDimension();
  assert.equal(v.ok, false); // expected 768, got mock 64
  assert.equal(v.dimension, embedding.MOCK_DIM);
  assert.ok(String(v.error).includes('dimension mismatch'));
});

// ---- storing embeddings ----

test('chunk: embedding can be saved and retrieved', async () => {
  await cleanChunks();
  setEnv({ AI_PROVIDER: 'mock', AI_EMBEDDINGS: 'mock' });
  const pid = new mongoose.Types.ObjectId();
  const mid = new mongoose.Types.ObjectId();
  const e = await embedding.generateEmbedding('sample text');
  const created = await Chunk.create({
    projectId: pid,
    materialId: mid,
    filename: 'doc.pdf',
    page: 1,
    text: 'sample text',
    embedding: e.vector,
  });
  const found = await Chunk.findById(created._id).lean();
  assert.ok(Array.isArray(found.embedding));
  assert.equal(found.embedding.length, e.vector.length);
  assert.equal(found.projectId.toString(), pid.toString());
  assert.equal(found.materialId.toString(), mid.toString());
});

// ---- retrievalService TF-IDF mode ----

test('retrievalService: tfidf mode finds relevant chunks and preserves metadata', async () => {
  await cleanChunks();
  setEnv({ AI_PROVIDER: 'mock', AI_EMBEDDINGS: 'off', RETRIEVAL_MODE: 'tfidf' });
  const pid = new mongoose.Types.ObjectId();
  await seedChunks(pid);
  const result = await retrievalService.search({ projectId: pid, question: 'RAG retrieval generation', k: 2 });
  assert.equal(result.method, 'tfidf');
  assert.ok(result.hits.length > 0);
  const top = result.hits[0].chunk;
  assert.ok(top.filename);
  assert.ok(typeof top.page === 'number');
  assert.ok(top.materialId);
});

test('retrievalService: unsupported question returns no evidence in tfidf mode', async () => {
  await cleanChunks();
  setEnv({ AI_PROVIDER: 'mock', AI_EMBEDDINGS: 'off', RETRIEVAL_MODE: 'tfidf' });
  const pid = new mongoose.Types.ObjectId();
  await seedChunks(pid);
  const result = await retrievalService.search({ projectId: pid, question: 'moon cheese recipe', k: 2 });
  assert.equal(result.method, 'tfidf');
  const supported = retrievalService.meetsEvidenceBar('moon cheese recipe', result);
  assert.equal(supported, false);
});

test('retrievalService: vector mode falls back to tfidf when Atlas is unavailable', async () => {
  await cleanChunks();
  setEnv({ AI_PROVIDER: 'mock', AI_EMBEDDINGS: 'mock', RETRIEVAL_MODE: 'vector' });
  const pid = new mongoose.Types.ObjectId();
  await seedChunks(pid);
  const result = await retrievalService.search({ projectId: pid, question: 'RAG retrieval generation', k: 2 });
  assert.equal(result.method, 'tfidf');
  assert.equal(result.fallbackUsed, true);
  assert.ok(result.fallbackReason.includes('VECTOR_SEARCH_UNAVAILABLE'));
});

// ---- project isolation ----

test('retrievalService: tfidf mode does not leak chunks across projects', async () => {
  await cleanChunks();
  setEnv({ AI_PROVIDER: 'mock', AI_EMBEDDINGS: 'off', RETRIEVAL_MODE: 'tfidf' });
  const projectA = new mongoose.Types.ObjectId();
  const projectB = new mongoose.Types.ObjectId();
  await Chunk.create({ projectId: projectA, materialId: new mongoose.Types.ObjectId(), filename: 'a.pdf', page: 1, text: 'Photosynthesis uses chlorophyll to capture sunlight energy.' });
  await Chunk.create({ projectId: projectB, materialId: new mongoose.Types.ObjectId(), filename: 'b.pdf', page: 1, text: 'Quantum entanglement links particles in superposition states.' });
  const result = await retrievalService.search({ projectId: projectA, question: 'quantum entanglement particles', k: 2 });
  assert.equal(result.hits.length, 0);
});

// ---- citations and unsupported handling via aiService ----

test('aiService: citations come from retrieved chunk metadata', async () => {
  setEnv({ AI_PROVIDER: 'mock', AI_FALLBACK_PROVIDER: 'none', AI_EMBEDDINGS: 'off', RETRIEVAL_MODE: 'tfidf' });
  const pid = new mongoose.Types.ObjectId();
  await cleanChunks();
  await seedChunks(pid);
  const out = await aiService.tutorResponse({ question: 'How does RAG combine retrieval with generation?', projectId: pid, context: { goal: 'learn RAG' } });
  assert.equal(out.grounded, true);
  assert.ok(out.citations.length > 0);
  assert.equal(out.citations[0].filename, 'rag.pdf');
  assert.equal(typeof out.citations[0].page, 'number');
});

test('aiService: unsupported questions return no citations and grounded=false', async () => {
  setEnv({ AI_PROVIDER: 'mock', AI_FALLBACK_PROVIDER: 'none', AI_EMBEDDINGS: 'off', RETRIEVAL_MODE: 'tfidf' });
  const pid = new mongoose.Types.ObjectId();
  await cleanChunks();
  await seedChunks(pid);
  const out = await aiService.tutorResponse({ question: 'moon cheese recipe', projectId: pid, context: { goal: 'learn RAG' } });
  assert.equal(out.grounded, false);
  assert.equal(out.citations.length, 0);
  assert.match(out.answer, /enough evidence/i);
});

// ---- vector evidence bar (unit) ----

test('vectorRetrieval: strong vector score counts as evidence', () => {
  const hits = [{ chunk: { text: 'x', tokens: ['rag', 'combines'] }, score: 0.85, lex: 0 }];
  assert.equal(vectorRetrieval.meetsEvidenceBar('How does RAG work?', hits), true);
});

test('vectorRetrieval: weak score with no overlap is not evidence', () => {
  const hits = [{ chunk: { text: 'x', tokens: ['unrelated'] }, score: 0.3, lex: 0 }];
  assert.equal(vectorRetrieval.meetsEvidenceBar('How does RAG work?', hits), false);
});

// ---- semantic retrieval demonstration (different wording) ----

test('retrievalService: semantic-like wording retrieves conceptually related chunk via TF-IDF fallback', async () => {
  await cleanChunks();
  setEnv({ AI_PROVIDER: 'mock', AI_EMBEDDINGS: 'off', RETRIEVAL_MODE: 'tfidf' });
  const pid = new mongoose.Types.ObjectId();
  await seedChunks(pid);
  // Question uses different wording from source text but shares concept terms.
  const result = await retrievalService.search({
    projectId: pid,
    question: 'How does retrieval-augmented generation mix searching with an LLM?',
    k: 2,
  });
  assert.ok(result.hits.length > 0);
  const pages = result.hits.map((h) => h.chunk.page);
  assert.ok(pages.includes(15) || pages.includes(16));
});

// ---- index definition ----

test('vectorRetrieval: index definition uses verified 768 dimension', () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_EMBEDDINGS: 'gemini' });
  const def = vectorRetrieval.getIndexDefinition();
  assert.equal(def.name, 'chunk_vector_index');
  const vectorField = def.definition.fields.find((f) => f.type === 'vector');
  assert.equal(vectorField.numDimensions, 768);
  assert.equal(vectorField.similarity, 'cosine');
  const filterField = def.definition.fields.find((f) => f.type === 'filter');
  assert.equal(filterField.path, 'projectId');
});

// ---- vector search unavailable is explicit ----

test('vectorRetrieval: search throws VECTOR_SEARCH_UNAVAILABLE when not on Atlas', async () => {
  await cleanChunks();
  setEnv({ AI_PROVIDER: 'mock', AI_EMBEDDINGS: 'mock', RETRIEVAL_MODE: 'vector' });
  const pid = new mongoose.Types.ObjectId();
  await seedChunks(pid);
  await assert.rejects(
    () => vectorRetrieval.search({ projectId: pid, question: 'RAG', k: 2 }),
    (e) => String(e.message).includes('VECTOR_SEARCH_UNAVAILABLE')
  );
});
