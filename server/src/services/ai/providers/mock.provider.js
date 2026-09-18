// Mock provider — thin adapter over the EXISTING Mock implementation.
// server/src/services/aiProvider.js is NOT modified; this file only renames its
// interface to the shared provider contract so the AI service can swap providers.
const mock = require('../../aiProvider');

const MODEL = mock.MODEL; // 'mock-local-1.0'

async function generateText(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('prompt must be a non-empty string');
  return { text: `(demo response) ${String(prompt).slice(0, 800)}`, model: MODEL };
}

async function generateTutorResponse({ question, hits, chunks, context }) {
  // Use pre-computed hits from vector/TF-IDF retrieval when available; otherwise
  // fall back to the legacy chunks interface (keeps existing tests unchanged).
  const r = (hits && hits.length)
    ? await mock.tutorAnswerFromHits({ question, hits, context })
    : await mock.tutorAnswer({ question, chunks, context });
  // Boundary normalization only (impl untouched): drop exact duplicate sources.
  const seen = new Set();
  r.citations = (r.citations || []).filter((c) => {
    const key = `${c.filename}::${c.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return r;
}

async function generatePageAwareResponse({ question, chunks, context }) {
  const r = await mock.pageAwareAnswer({ question, chunks, context });
  const seen = new Set();
  r.citations = (r.citations || []).filter((c) => {
    const key = `${c.filename}::${c.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return r;
}

async function generateQuiz({ chunks, mastery, history, n }) {
  return mock.makeQuiz({ chunks, mastery, history, n });
}

async function evaluateAssessment({ prompt, rubric, answer, sourceText }) {
  return mock.gradeOpen({ prompt, rubric, answer, sourceText });
}

async function extractConcepts(text) {
  return mock.extractConcepts(text);
}

// Recommendation templates — intentionally identical to the originals in
// services/learning.js so mock mode output is byte-for-byte unchanged.
function recommendWeak(concepts) {
  return {
    text: `Focus next on ${concepts.join(', ')} — scores dipped. Re-read the cited pages and take a short 3-question re-quiz.`,
    reason: 'weak-concept detection',
  };
}

function recommendGrowth(improved) {
  return {
    text: `Nice growth in ${improved.join(', ')}. Try application-style questions next.`,
    reason: 'growth',
  };
}

async function generateRecommendation(kind, payload = {}) {
  if (kind === 'weak') return recommendWeak(payload.concepts || []);
  return recommendGrowth(payload.improved || []);
}

module.exports = {
  name: 'mock',
  MODEL,
  generateText,
  generateTutorResponse,
  generatePageAwareResponse,
  generateQuiz,
  evaluateAssessment,
  extractConcepts,
  generateRecommendation,
};
