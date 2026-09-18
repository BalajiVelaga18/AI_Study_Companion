const fs = require('fs');
const pdfParse = require('pdf-parse');
const { Chunk, Material, Concept, Job, Event } = require('../models');
const { tokens } = require('./retrieval');
const aiService = require('./ai/service');

function retrievalMode() {
  return String(process.env.RETRIEVAL_MODE || 'tfidf').toLowerCase();
}

// In-process background queue: queued → processing → ready/failed, retries, idempotency.
const queue = [];
let running = false;

async function enqueue(kind, refId, ownerId, idempotencyKey, handler) {
  const existing = await Job.findOne({ idempotencyKey });
  if (existing) return existing; // duplicate-job handling
  const job = await Job.create({ kind, refId, ownerId, idempotencyKey, status: 'queued' });
  queue.push({ jobId: job._id.toString(), handler });
  pump();
  return job;
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const { jobId, handler } = queue.shift();
    const job = await Job.findById(jobId);
    if (!job || job.status === 'done') continue;
    job.status = 'processing'; job.attempts += 1; await job.save();
    try {
      await handler();
      job.status = 'done'; await job.save();
    } catch (e) {
      job.lastError = String(e.message || e);
      if (job.attempts < 3) { job.status = 'queued'; queue.push({ jobId, handler }); } // retry
      else job.status = 'failed';
      await job.save();
    }
  }
  running = false;
}

async function embedAllChunks(materialId, emb) {
  const expectedDim = emb.expectedDimension();
  const saved = await Chunk.find({ materialId }, { _id: 1, text: 1 }).lean();
  const batchSize = 100;
  let embeddedCount = 0;
  let anyFallback = false;
  for (let i = 0; i < saved.length; i += batchSize) {
    const batch = saved.slice(i, i + batchSize);
    const texts = batch.map((ch) => ch.text);
    const embeddings = await emb.generateEmbeddings(texts);
    if (!embeddings) continue; // embeddings disabled
    if (embeddings.some((e) => e.fallbackUsed)) anyFallback = true;
    const ops = [];
    for (let j = 0; j < batch.length; j++) {
      const e = embeddings[j];
      if (e?.vector?.length && (!expectedDim || e.vector.length === expectedDim)) {
        ops.push({ updateOne: { filter: { _id: batch[j]._id }, update: { $set: { embedding: e.vector } } } });
        embeddedCount++;
      }
    }
    if (ops.length) await Chunk.bulkWrite(ops);
  }
  return { embeddedCount, total: saved.length, anyFallback };
}

async function processMaterial(materialId) {
  const m = await Material.findById(materialId);
  if (!m || m.status === 'ready') return;
  m.status = 'processing'; await m.save();
  await Event.create({ ownerId: m.ownerId, projectId: m.projectId, type: 'material.processing', data: { materialId: m._id } });
  try {
    const buf = fs.readFileSync(m.path);
    const parsed = await pdfParse(buf).catch(() => ({ text: fs.readFileSync(m.path, 'utf8').slice(0, 20000), numpages: 1 }));
    const text = (parsed.text || '').slice(0, 200000);
    // Chunk ~800 chars with page estimate
    const pages = Math.max(1, parsed.numpages || 1);
    const size = 800;
    const docs = [];
    for (let i = 0; i < text.length; i += size) {
      const slice = text.slice(i, i + size);
      const page = Math.min(pages, 1 + Math.floor(i / (text.length / pages)));
      docs.push({ ownerId: m.ownerId, projectId: m.projectId, materialId: m._id, page, text: slice, tokens: tokens(slice), filename: m.filename });
    }
    if (docs.length) await Chunk.insertMany(docs);
    // Concepts via AI service (mock path returns the same heuristic output as before)
    for (const c of await aiService.extractConcepts(text)) {
      await Concept.findOneAndUpdate(
        { projectId: m.projectId, name: c.name },
        { $setOnInsert: { ownerId: m.ownerId, projectId: m.projectId, name: c.name, mastery: 0.3 } },
        { upsert: true }
      );
    }
    // Chunk embeddings: generate for ALL chunks in batches. In vector mode this
    // is required; in tfidf mode it is best-effort and failures are tolerated.
    let embeddingInfo = { embeddedCount: 0, total: docs.length, anyFallback: false };
    try {
      const emb = require('./ai/embedding');
      if (emb.isEnabled()) {
        embeddingInfo = await embedAllChunks(m._id, emb);
      } else if (retrievalMode() === 'vector') {
        throw new Error('RETRIEVAL_MODE=vector requires AI_EMBEDDINGS to be enabled');
      }
    } catch (e) {
      console.log('[AI] chunk embedding failed:', e.message);
      if (retrievalMode() === 'vector') {
        m.status = 'failed'; m.error = `Embedding generation failed: ${e.message}`; await m.save();
        await Event.create({ ownerId: m.ownerId, projectId: m.projectId, type: 'material.failed', data: { materialId: m._id, error: m.error } });
        throw e;
      }
    }
    m.status = 'ready'; m.pageCount = pages; await m.save();
    await Event.create({ ownerId: m.ownerId, projectId: m.projectId, type: 'material.ready', data: { materialId: m._id, chunks: docs.length, embeddings: embeddingInfo.embeddedCount } });
  } catch (e) {
    m.status = 'failed'; m.error = String(e.message || e); await m.save();
    await Event.create({ ownerId: m.ownerId, projectId: m.projectId, type: 'material.failed', data: { materialId: m._id, error: m.error } });
    throw e;
  }
}

module.exports = { enqueue, processMaterial };
