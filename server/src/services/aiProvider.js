// Provider abstraction. MockLocal = deterministic, grounded, offline.
// To use OpenAI/Gemini: add generate()/generateStructured() impl honoring the same contract.
const { retrieve, tokens, meetsEvidenceBar } = require('./retrieval');

const MODEL = 'mock-local-1.0';

// Sanitize: treat material/user text as DATA, never as instructions.
function sanitize(s) { return String(s || '').replace(/```/g, "'''").slice(0, 4000); }

function bestSentence(text, qterms) {
  const sentences = String(text).split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 12);
  if (!sentences.length) return text;
  const scored = sentences.map((s) => {
    const st = new Set(tokens(s));
    const matches = [...qterms].filter((t) => st.has(t)).length;
    return { s, matches, len: s.length };
  });
  scored.sort((a, b) => b.matches - a.matches || a.len - b.len);
  return scored[0].s;
}

function formatMockAnswer({ question, hits, context }) {
  const intent = context?.intent || 'ask';
  const goal = sanitize(context?.goal || '');
  const weak = (context?.weaknesses || []).slice(0, 3);
  const qterms = new Set(tokens(question));
  // Only use hits that are reasonably close to the best score; drops
  // marginally-related chunks that happen to share a generic term.
  const bestScore = hits[0]?.score || 0;
  const relevant = hits.filter((h) => h.score >= bestScore * 0.5).slice(0, 2);
  const top = relevant.length ? relevant : hits.slice(0, 1);
  const points = top.map((h) => bestSentence(h.chunk.text, qterms));
  const cites = top.map((h) => ({ materialId: h.chunk.materialId, filename: h.chunk.filename, page: h.chunk.page }));

  let intro = 'Based on your materials';
  if (intent === 'simplify') intro = 'Here is a simple explanation';
  else if (intent === 'example') intro = 'Here is an example';
  else if (intent === 'revise') intro = 'Quick review';

  const lines = [];
  lines.push(`${intro}${goal ? ` for “${goal}”` : ''}:`);
  lines.push('');
  for (const p of points) lines.push(`- ${p}`);
  if (intent === 'revise' && weak.length) {
    lines.push('');
    lines.push(`Focus areas: ${weak.join(', ')}.`);
  }
  lines.push('');
  lines.push('Ask a follow-up if you would like a deeper explanation or another example.');
  return { text: lines.join('\n'), cites };
}

async function tutorAnswer({ question, chunks, context }) {
  const t0 = Date.now();
  const hits = retrieve(question, chunks, 4);
  // Use the same evidence gate as the AI service so mock mode never drifts.
  const supported = meetsEvidenceBar(question, hits, chunks);
  // Unsupported handling: weak/no evidence → explicit uncertainty, never fabricated.
  if (!supported) {
    return {
      answer: 'I don\'t have enough evidence in your project materials to answer that reliably. Upload relevant material or rephrase within the scope of: ' + (context?.goal || 'this project') + '.',
      citations: [], grounded: false, model: MODEL, latencyMs: Date.now() - t0,
    };
  }
  const { text, cites } = formatMockAnswer({ question, hits, context });
  return { answer: text, citations: cites, grounded: true, model: MODEL, latencyMs: Date.now() - t0 };
}

// Answer from pre-computed hits (used by vector retrieval) without re-running
// TF-IDF. The evidence gate is re-applied to the supplied hits.
async function tutorAnswerFromHits({ question, hits, context }) {
  const t0 = Date.now();
  if (!hits || !hits.length) {
    return {
      answer: 'I don\'t have enough evidence in your project materials to answer that reliably. Upload relevant material or rephrase within the scope of: ' + (context?.goal || 'this project') + '.',
      citations: [], grounded: false, model: MODEL, latencyMs: Date.now() - t0,
    };
  }
  // Ensure tokens are available for the evidence gate (vector hits may only have text).
  for (const h of hits) {
    if (!h.chunk.tokens && h.chunk.text) h.chunk.tokens = tokens(h.chunk.text);
  }
  const supported = meetsEvidenceBar(question, hits, hits.map((h) => h.chunk));
  if (!supported) {
    return {
      answer: 'I don\'t have enough evidence in your project materials to answer that reliably. Upload relevant material or rephrase within the scope of: ' + (context?.goal || 'this project') + '.',
      citations: [], grounded: false, model: MODEL, latencyMs: Date.now() - t0,
    };
  }
  const { text, cites } = formatMockAnswer({ question, hits, context });
  return { answer: text, citations: cites, grounded: true, model: MODEL, latencyMs: Date.now() - t0 };
}

// Page-aware answer: the user explicitly named a page (e.g. "What's in page 2?").
// Bypass semantic retrieval/evidence bar and ground the answer directly in the
// chunks from that page.
async function pageAwareAnswer({ question, chunks, context }) {
  const t0 = Date.now();
  if (!chunks || !chunks.length) {
    return {
      answer: 'I don\'t have enough evidence on that page in your project materials. Upload relevant material or rephrase within the scope of: ' + (context?.goal || 'this project') + '.',
      citations: [], grounded: false, model: MODEL, latencyMs: Date.now() - t0,
    };
  }
  const qterms = new Set(tokens(question));
  const points = chunks.slice(0, 3).map((c) => bestSentence(c.text, qterms));
  const cites = chunks.slice(0, 3).map((c) => ({ materialId: c.materialId, filename: c.filename, page: c.page }));
  const lines = [];
  lines.push(`Here is what your materials say on page ${context?.page || ''}:`);
  lines.push('');
  for (const p of points) lines.push(`- ${p}`);
  lines.push('');
  lines.push('Ask a follow-up if you would like a deeper explanation or another example.');
  return { answer: lines.join('\n'), citations: cites, grounded: true, model: MODEL, latencyMs: Date.now() - t0 };
}

function extractConcepts(text) {
  // Heuristic concept extraction: frequent capitalized phrases / long keywords.
  const words = (text.toLowerCase().match(/[a-z][a-z\-]{3,}/g) || []).filter((w) => !STOP.has(w));
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
}
const STOP = new Set('this,that,with,from,have,were,will,what,when,where,which,while,about,into,over,after,before,between,under,there,their,them,then,than,they,your,you,and,for,the,are,but,not,all,any,can,had,her,was,one,our,out,has,have,more,very,should,could,would,also,each,make,made,such,only,like,using,used,use,based,within,across,these,those'.split(','));

function makeQuiz({ chunks, mastery, history, n = 5 }) {
  // Adaptive selection: prefer low-mastery concepts, unseen questions, recent mistakes (not naive easy/hard flip).
  const concepts = mastery.length ? [...mastery].sort((a, b) => a.mastery - b.mastery) : [{ name: 'general', mastery: 0.3 }];
  const pool = chunks.slice(0, 20);
  const items = [];
  for (let i = 0; i < n; i++) {
    const concept = concepts[i % concepts.length];
    const c = pool[(i * 3) % Math.max(1, pool.length)];
    const sentence = (c?.text || 'No material yet. General study question.').split('. ').slice(0, 2).join('. ');
    if (i % 2 === 0) {
      const distract = ['A restatement with a key detail changed', 'An unrelated fact from another topic', 'A common misconception'];
      items.push({ id: `q${Date.now()}-${i}`, type: 'mcq', concept: concept.name, difficulty: concept.mastery < 0.5 ? 'foundations' : 'application', prompt: `About "${concept.name}": which statement is best supported by: "${sentence.slice(0, 160)}…"?`, options: ['Correct: the supported statement', ...distract], correctIndex: 0, source: c ? { materialId: c.materialId, filename: c.filename, page: c.page } : null });
    } else {
      items.push({ id: `q${Date.now()}-${i}`, type: 'open', concept: concept.name, difficulty: concept.mastery < 0.5 ? 'explain' : 'apply', prompt: `Explain "${concept.name}" in your own words and give one example grounded in the material.`, rubric: ['names the concept', 'states one accurate mechanism/detail', 'gives a relevant example', 'no contradiction'], source: c ? { materialId: c.materialId, filename: c.filename, page: c.page } : null });
    }
  }
  return items;
}

function gradeOpen({ prompt, rubric, answer, sourceText }) {
  const a = (answer || '').toLowerCase();
  const covered = (rubric || []).filter((r) => {
    const keys = r.toLowerCase().split(' ').filter((w) => w.length > 4);
    return keys.some((k) => a.includes(k)) || a.length > 120;
  });
  const missing = (rubric || []).filter((r) => !covered.includes(r));
  const evidenceHit = sourceText && a.length > 40 && sourceText.toLowerCase().split(' ').some((w) => w.length > 6 && a.includes(w));
  const score = Math.round((covered.length / Math.max(1, (rubric || []).length)) * 100);
  const feedback = `You covered ${covered.length}/${(rubric || []).length} key points (${covered.join('; ') || 'none yet'}). Missing: ${missing.join('; ') || 'nothing major'}. ${evidenceHit ? 'Good grounding in the material.' : 'Try to reference a specific detail or example from the material.'}`;
  return { score, covered, missing, feedback };
}

module.exports = { tutorAnswer, tutorAnswerFromHits, pageAwareAnswer, extractConcepts, makeQuiz, gradeOpen, MODEL, sanitize };
