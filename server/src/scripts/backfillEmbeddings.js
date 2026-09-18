#!/usr/bin/env node
// Backfill embeddings for existing chunks that don't have them.
//
// Usage:
//   AI_EMBEDDINGS=gemini RETRIEVAL_MODE=vector npm --workspace server run backfill:embeddings
//
//   Test one chunk:
//   BACKFILL_TEST_LIMIT=1 AI_EMBEDDINGS=gemini npm --workspace server run backfill:embeddings
//
//   Dry run:
//   BACKFILL_DRY_RUN=true BACKFILL_TEST_LIMIT=5 AI_EMBEDDINGS=gemini npm --workspace server run backfill:embeddings
//
// This script:
//   - Requires REAL 768-dimensional embeddings.
//   - Never writes mock 64-dimensional embeddings to the database.
//   - Retries transient errors with exponential backoff.
//   - Stops immediately on daily quota exhaustion (quota_exceeded).
//   - Processes each chunk at most once per invocation.
//   - Fails chunks permanently after retries are exhausted.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../config');
const { Chunk } = require('../models');
const embedding = require('../services/ai/embedding');

const BATCH_SIZE = Math.max(1, Math.min(500, Number(process.env.BACKFILL_BATCH_SIZE || 50)));
const MAX_RETRIES = Math.max(0, Number(process.env.BACKFILL_MAX_RETRIES || 3));
const TEST_LIMIT = Number(process.env.BACKFILL_TEST_LIMIT || 0); // 0 = unlimited
const DRY_RUN = String(process.env.BACKFILL_DRY_RUN || '').toLowerCase() === 'true';

const STOP_CATEGORIES = new Set(['quota_exceeded']);
const RETRY_CATEGORIES = new Set(['rate_limited', 'timeout', 'network', 'unavailable', 'server_error']);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Generate a real embedding for one chunk with bounded retry/backoff.
// Returns { ok, embedding?, error?, category?, stop? }.
async function embedChunk(text, attempt = 0) {
  try {
    const e = await embedding.generateEmbedding(text, { allowFallback: false });
    if (!e || !e.vector || !e.vector.length) {
      return { ok: false, error: 'empty embedding returned', category: 'invalid_response' };
    }
    const expectedDim = embedding.expectedDimension();
    if (expectedDim && e.vector.length !== expectedDim) {
      return {
        ok: false,
        error: `embedding dimension mismatch: expected ${expectedDim}, got ${e.vector.length}`,
        category: 'invalid_dimension',
      };
    }
    return { ok: true, embedding: e.vector };
  } catch (e) {
    const category = e?.category || 'unknown';
    if (STOP_CATEGORIES.has(category)) {
      return { ok: false, error: String(e.message || e), category, stop: true };
    }
    if (RETRY_CATEGORIES.has(category) && attempt < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      console.log(`[backfill] retryable ${category} for chunk, waiting ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      return embedChunk(text, attempt + 1);
    }
    return { ok: false, error: String(e.message || e), category };
  }
}

async function run() {
  if (!embedding.isEnabled()) {
    console.error('[backfill] AI_EMBEDDINGS is disabled. Set AI_EMBEDDINGS=gemini.');
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('[backfill] GEMINI_API_KEY is required for real embeddings.');
    process.exit(1);
  }

  await connectDB(process.env.MONGO_URI);
  console.log('[backfill] connected to:', mongoose.connection.name);

  const cfg = embedding.getEmbeddingConfig();
  const expectedDim = embedding.expectedDimension();
  console.log('[backfill] provider:', cfg.provider, '| model:', cfg.model, '| expected dim:', expectedDim);
  console.log('[backfill] dry run:', DRY_RUN, '| test limit:', TEST_LIMIT || 'none', '| max retries:', MAX_RETRIES);

  // Fetch all eligible chunk IDs and text once so each chunk is processed at
  // most per invocation. Eligible = any chunk whose embedding is missing, null,
  // or an array whose length is not exactly 768.
  const eligible = await Chunk.find({
    $or: [
      { embedding: { $exists: false } },
      { embedding: null },
      { embedding: { $type: 'array', $not: { $size: 768 } } },
    ],
  }, { text: 1, projectId: 1, materialId: 1, page: 1 }).lean();

  if (!eligible.length) {
    console.log('[backfill] no eligible chunks found');
    await closeDB();
    process.exit(0);
  }

  const toProcess = TEST_LIMIT > 0 ? eligible.slice(0, TEST_LIMIT) : eligible;
  console.log(`[backfill] eligible chunks: ${eligible.length}, will process: ${toProcess.length}`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failuresByCategory = {};

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const ops = [];

    for (const chunk of batch) {
      processed++;
      const text = String(chunk.text || '').trim();
      if (!text) {
        console.log(`[backfill] skipping chunk ${chunk._id}: empty text`);
        skipped++;
        continue;
      }

      const result = await embedChunk(text);

      if (result.stop) {
        console.error(`[backfill] stopping: ${result.category} — ${result.error}`);
        await closeDB();
        process.exit(1);
      }

      if (!result.ok) {
        failed++;
        failuresByCategory[result.category] = (failuresByCategory[result.category] || 0) + 1;
        console.log(`[backfill] failed chunk ${chunk._id}: ${result.category} — ${result.error}`);
        continue;
      }

      if (DRY_RUN) {
        updated++;
        console.log(`[backfill] dry-run: would update chunk ${chunk._id} with ${result.embedding.length}-dim embedding`);
        continue;
      }

      ops.push({
        updateOne: {
          filter: { _id: chunk._id },
          update: { $set: { embedding: result.embedding } },
        },
      });
    }

    if (ops.length) {
      const result = await Chunk.bulkWrite(ops);
      updated += result.modifiedCount || ops.length;
      console.log(`[backfill] batch written: ${result.modifiedCount || ops.length} chunks`);
    }

    console.log(`[backfill] progress: processed=${processed}/${toProcess.length} updated=${updated} skipped=${skipped} failed=${failed}`);
  }

  console.log('[backfill] complete:', { processed, updated, skipped, failed, failuresByCategory });
  await closeDB();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('[backfill] fatal:', e);
  process.exit(1);
});
