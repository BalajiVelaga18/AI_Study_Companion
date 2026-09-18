// Provider abstraction tests — no DB, no API key needed (simulation knobs).
const test = require('node:test');
const assert = require('node:assert');
const { tokens } = require('../src/services/retrieval');
const aiService = require('../src/services/ai/service');
const embedding = require('../src/services/ai/embedding');
const { ProviderError, isFallbackEligibleError } = require('../src/services/ai/errors');
const gemini = require('../src/services/ai/providers/gemini.provider');
const { AIUsage } = require('../src/models');

const CHUNKS = [
  { materialId: 'm1', filename: 'ML Notes.pdf', page: 14, text: 'Gradient descent updates weights opposite the gradient scaled by learning rate.', tokens: tokens('Gradient descent updates weights opposite the gradient scaled by learning rate.') },
];

const ENV_KEYS = ['AI_PROVIDER', 'AI_FALLBACK_PROVIDER', 'GEMINI_API_KEY', 'GEMINI_SIMULATE_FAILURE', 'GEMINI_SIMULATE_ERROR', 'GEMINI_SIMULATE_DELAY_MS', 'GEMINI_SIMULATE_BAD_JSON', 'AI_TIMEOUT_MS', 'AI_EMBEDDINGS'];
const savedEnv = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
function setEnv(o) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, o);
}
test.after(() => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, savedEnv); });

test('1/5 mock mode: tutor works exactly as before, provider=mock', async () => {
  setEnv({ AI_PROVIDER: 'mock', AI_FALLBACK_PROVIDER: 'none' });
  const out = await aiService.tutorResponse({ question: 'What is gradient descent?', chunks: CHUNKS, context: { goal: 'Learn ML' } });
  assert.equal(out.provider, 'mock');
  assert.equal(out.fallbackUsed, false);
  assert.equal(out.grounded, true);
  assert.ok(out.citations.length > 0 && out.citations[0].page === 14);
});

test('2/5 gemini quota failure → mock fallback with honest attribution', async () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'mock', GEMINI_SIMULATE_FAILURE: 'true', GEMINI_SIMULATE_ERROR: 'quota_exceeded' });
  const out = await aiService.tutorResponse({ question: 'What is gradient descent?', chunks: CHUNKS, context: { goal: 'Learn ML' } });
  assert.equal(out.provider, 'mock');
  assert.equal(out.fallbackUsed, true);
  assert.equal(out.fallbackReason, 'quota_exceeded');
  assert.equal(out.grounded, true); // fallback still respects retrieved context
  assert.ok(out.citations.length > 0);
});

test('3/5 gemini timeout → mock fallback (reason timeout)', async () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'mock', GEMINI_SIMULATE_DELAY_MS: '2500', AI_TIMEOUT_MS: '1000' });
  const out = await aiService.tutorResponse({ question: 'What is gradient descent?', chunks: CHUNKS, context: { goal: 'Learn ML' } });
  assert.equal(out.provider, 'mock');
  assert.equal(out.fallbackUsed, true);
  assert.equal(out.fallbackReason, 'timeout');
}, { timeout: 15000 });

test('4/5 gemini-only mode failure → proper error, never silent fallback', async () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'none', GEMINI_SIMULATE_FAILURE: 'true' });
  await assert.rejects(
    aiService.tutorResponse({ question: 'What is gradient descent?', chunks: CHUNKS, context: {} }),
    (e) => e instanceof ProviderError && e.category === 'unavailable'
  );
  const msg = aiService.userSafeMessage(new ProviderError({ category: 'quota_exceeded' }));
  assert.match(msg, /temporarily unavailable/);
  assert.ok(!msg.includes('stack') && !msg.includes('key'), 'no internals leaked');
});

test('5/5 error classification: provider faults eligible, programming errors not', () => {
  assert.equal(isFallbackEligibleError(new ProviderError({ category: 'auth' })), true);
  assert.equal(isFallbackEligibleError(new ProviderError({ category: 'rate_limited' })), true);
  assert.equal(isFallbackEligibleError(new ProviderError({ category: 'timeout' })), true);
  assert.equal(isFallbackEligibleError(new ProviderError({ category: 'model_not_found' })), true);
  assert.equal(isFallbackEligibleError(new Error('invalid arguments')), false);
  assert.equal(isFallbackEligibleError(new Error('db failed')), false);
  // retired-model 404 maps to model_not_found (no retry, but fallback-eligible)
  const mapped = gemini.__internal.mapSdkError({ status: 404, message: 'models/gemini-2.0-flash is no longer available' });
  assert.equal(mapped.category, 'model_not_found');
  assert.equal(isFallbackEligibleError(mapped), true);
});

test('6/5 malformed gemini structured output → validated, then mock fallback', async () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'mock', GEMINI_SIMULATE_BAD_JSON: 'true' });
  const out = await aiService.generateQuiz({ chunks: CHUNKS, mastery: [{ name: 'grad', mastery: 0.2 }], history: [], n: 2 });
  assert.equal(out.provider, 'mock');
  assert.equal(out.fallbackUsed, true);
  assert.equal(out.items.length, 2);
  assert.ok(out.items.some((i) => i.type === 'mcq') && out.items.some((i) => i.type === 'open'));
  // schema itself rejects garbage
  assert.equal(gemini.__internal.QuizSchema.safeParse({ questions: [{ type: 'mcq' }] }).success, false);
});

// ---- Quiz-specific fallback contract ----
test('quiz A: mock mode produces valid quiz items with provider=mock', async () => {
  setEnv({ AI_PROVIDER: 'mock', AI_FALLBACK_PROVIDER: 'none' });
  const out = await aiService.generateQuiz({ chunks: CHUNKS, mastery: [{ name: 'grad', mastery: 0.2 }], history: [], n: 3 });
  assert.equal(out.provider, 'mock');
  assert.equal(out.fallbackUsed, false);
  assert.equal(out.items.length, 3);
  for (const item of out.items) {
    assert.ok(item.id && item.concept && item.difficulty && item.prompt);
    if (item.type === 'mcq') {
      assert.ok(Array.isArray(item.options) && item.options.length >= 2);
      assert.ok(typeof item.correctIndex === 'number');
    } else {
      assert.ok(Array.isArray(item.rubric) && item.rubric.length >= 1);
    }
  }
});

test('quiz B: gemini 429/quota_exceeded → mock fallback with honest attribution', async () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'mock', GEMINI_SIMULATE_FAILURE: 'true', GEMINI_SIMULATE_ERROR: 'quota_exceeded' });
  const out = await aiService.generateQuiz({ chunks: CHUNKS, mastery: [{ name: 'grad', mastery: 0.2 }], history: [], n: 3 });
  assert.equal(out.provider, 'mock');
  assert.equal(out.fallbackUsed, true);
  assert.equal(out.fallbackReason, 'quota_exceeded');
  assert.equal(out.items.length, 3);
});

test('quiz C: gemini timeout → mock fallback (reason timeout)', async () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'mock', GEMINI_SIMULATE_DELAY_MS: '2500', AI_TIMEOUT_MS: '1000' });
  const out = await aiService.generateQuiz({ chunks: CHUNKS, mastery: [{ name: 'grad', mastery: 0.2 }], history: [], n: 3 });
  assert.equal(out.provider, 'mock');
  assert.equal(out.fallbackUsed, true);
  assert.equal(out.fallbackReason, 'timeout');
  assert.equal(out.items.length, 3);
}, { timeout: 15000 });

test('quiz D: gemini 500/server_error → mock fallback', async () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'mock', GEMINI_SIMULATE_FAILURE: 'true', GEMINI_SIMULATE_ERROR: 'server_error' });
  const out = await aiService.generateQuiz({ chunks: CHUNKS, mastery: [{ name: 'grad', mastery: 0.2 }], history: [], n: 3 });
  assert.equal(out.provider, 'mock');
  assert.equal(out.fallbackUsed, true);
  assert.equal(out.fallbackReason, 'server_error');
  assert.equal(out.items.length, 3);
});

test('quiz E: gemini-only mode with provider failure throws instead of silent mock fallback', async () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'none', GEMINI_SIMULATE_FAILURE: 'true', GEMINI_SIMULATE_ERROR: 'quota_exceeded' });
  await assert.rejects(
    aiService.generateQuiz({ chunks: CHUNKS, mastery: [{ name: 'grad', mastery: 0.2 }], history: [], n: 3 }),
    (e) => e instanceof ProviderError && e.category === 'quota_exceeded'
  );
});

test('quiz F: mock response passes Quiz schema validation', () => {
  const parsed = gemini.__internal.QuizSchema.safeParse({
    questions: [
      { type: 'mcq', concept: 'grad', difficulty: 'foundations', prompt: 'What is gradient descent?', options: ['A', 'B', 'C'], correctIndex: 0, explanation: '' },
      { type: 'open', concept: 'grad', difficulty: 'explain', prompt: 'Explain gradient descent.', rubric: ['names concept', 'gives example'] },
    ],
  });
  assert.equal(parsed.success, true);
});

test('7/5 embeddings: mock is deterministic, cosine sane, off by default in mock mode', async () => {
  setEnv({ AI_PROVIDER: 'mock', AI_FALLBACK_PROVIDER: 'none' });
  assert.equal(embedding.isEnabled(), false); // mock mode behavior unchanged (pure TF-IDF)
  setEnv({ AI_EMBEDDINGS: 'mock' });
  const a = await embedding.generateEmbedding('gradient descent learning rate');
  const b = await embedding.generateEmbedding('gradient descent learning rate');
  assert.equal(a.provider, 'mock');
  assert.equal(embedding.cosine(a.vector, b.vector), 1);
  const c = await embedding.generateEmbedding('photosynthesis chlorophyll rainforest');
  assert.ok(embedding.cosine(a.vector, c.vector) < 0.5);
});

test('8/5 observability contract: provider/fallback fields on results + AIUsage schema', async () => {
  setEnv({ AI_PROVIDER: 'gemini', AI_FALLBACK_PROVIDER: 'mock', GEMINI_SIMULATE_FAILURE: 'true', GEMINI_SIMULATE_ERROR: 'rate_limited' });
  const out = await aiService.evaluateAssessment({ prompt: 'q', rubric: ['names the concept', 'gives example'], answer: 'names the concept with example detail about learning', sourceText: 'gradient descent learning rate example' });
  for (const k of ['provider', 'fallbackUsed', 'score', 'feedback']) assert.ok(k in out, `missing ${k}`);
  assert.equal(out.provider, 'mock');
  const paths = AIUsage.schema.paths;
  for (const k of ['provider', 'fallbackUsed', 'errorCategory', 'inputTokens', 'outputTokens']) {
    assert.ok(paths[k], `AIUsage missing ${k}`);
  }
});
