// Local TF-IDF retrieval over project chunks. No external keys needed.
// Stopwords are excluded so a lone "the"/"what" can never count as evidence.
const STOP = new Set('a,an,the,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,am,what,which,who,whom,whose,when,where,why,how,that,this,these,those,there,their,them,they,you,your,all,any,can,had,has,have,had,not,one,our,out,more,very,should,could,would,also,each,make,made,such,only,like,using,used,use,into,over,after,before,between,under,about,than,its,itself,just,than,too,very,will,shall,may,might,must,do,does,did,done,than,won,let,per,via'.split(','));
function tokens(s) { return (s.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((t) => !STOP.has(t)); }

function retrieve(query, chunks, k = 4, queryEmbedding = null) {
  const q = tokens(query);
  const qset = new Set(q);
  if (!qset.size || !chunks.length) return [];
  const df = {};
  for (const c of chunks) {
    const chunkTokens = (c.tokens && c.tokens.length) ? c.tokens : tokens(c.text || '');
    for (const t of new Set(chunkTokens)) df[t] = (df[t] || 0) + 1;
  }
  const N = chunks.length;
  const qvec = queryEmbedding && queryEmbedding.vector ? queryEmbedding.vector : null;
  const scored = chunks.map((c) => {
    const ct = {};
    const chunkTokens = (c.tokens && c.tokens.length) ? c.tokens : tokens(c.text || '');
    for (const t of chunkTokens) ct[t] = (ct[t] || 0) + 1;
    let lex = 0;
    for (const t of qset) {
      if (!ct[t]) continue;
      const idf = Math.log(1 + N / (1 + (df[t] || 0)));
      lex += ct[t] * idf;
    }
    // Blend cosine similarity ONLY when both sides have same-dim embeddings;
    // `lex` (pure TF-IDF) is kept for the evidence gate below.
    let score = lex;
    if (qvec && Array.isArray(c.embedding) && c.embedding.length === qvec.length) {
      const cos = cosine(qvec, c.embedding);
      if (cos > 0) score += cos * 2;
    }
    // small boost for phrase overlap
    return { chunk: c, score, lex };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  return scored;
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Shared evidence bar. A top hit counts as evidence only if the overlap with
// the question includes at least one DISTINCTIVE term (present in a small
// minority of the corpus) — or the top hit's lexical score is clearly above
// the noise floor. This rejects "two generic words matched" (e.g.
// retrieval+model in an unrelated chunk about bag-of-words or the Louvre)
// while keeping genuine rare-term matches. The gate uses the pure lexical
// score (`lex`) so embedding blends can reorder but never fabricate evidence.
function meetsEvidenceBar(question, hits, chunks) {
  if (!hits || !hits.length) return false;
  const top = hits[0];
  const qterms = new Set(tokens(question));
  const topTerms = new Set((top.chunk.tokens && top.chunk.tokens.length) ? top.chunk.tokens : tokens(top.chunk.text || ''));
  const overlap = [...qterms].filter((t) => topTerms.has(t));
  const lexBest = top.lex ?? top.score;
  // Treat all-caps acronyms in the question (e.g. "RAG") as substantive terms
  // so acronym-based conceptual questions can be answered from the material.
  const acronyms = new Set((String(question).match(/\b[A-Z]{2,}\b/g) || []).map((t) => t.toLowerCase()));
  const hasLongTerm = overlap.some((t) => t.length >= 5 || acronyms.has(t));
  const hasAcronymOverlap = overlap.some((t) => acronyms.has(t));
  const multi = overlap.length >= 2 && hasLongTerm;
  // Strong single-term hit when the term is substantive. Acronyms get a lower
  // lexical threshold because they are usually distinctive by themselves.
  const strongSingle = overlap.length >= 1 && hasLongTerm && (lexBest >= 1.5 || hasAcronymOverlap);
  if (!multi && !strongSingle) return false;
  const N = Array.isArray(chunks) ? chunks.length : 0;
  if (N <= 1) return true; // single-chunk project (or legacy caller): overlap rule suffices
  // Distinctive = term appears in at most 25% of chunks (capped at N-1).
  const bar = Math.max(1, Math.min(Math.ceil(N / 4), N - 1));
  const df = {};
  for (const c of chunks) {
    const set = new Set((c.tokens && c.tokens.length) ? c.tokens : tokens(c.text || ''));
    for (const t of overlap) if (set.has(t)) df[t] = (df[t] || 0) + 1;
  }
  const hasDistinctive = overlap.some((t) => (df[t] ?? N) <= bar);
  if (hasDistinctive) return true;
  // Without a distinctive term, demand a much stronger lexical signal.
  return lexBest >= 2.0;
}

function unsupportedMessage(goal) {
  return 'I don\'t have enough evidence in your project materials to answer that reliably. Upload relevant material or rephrase within the scope of: ' + (goal || 'this project') + '.';
}

// Page-aware query support: detect explicit references like "page 2",
// "explain page 5", "summarize page 10", "what does page 3 say?".
function detectPageReference(question) {
  const m = /\bpage\s*(?:number\s*)?(\d+)\b/i.exec(String(question || ''));
  return m ? Number(m[1]) : null;
}

function retrieveByPage(page, chunks) {
  if (!page || !Array.isArray(chunks)) return [];
  const matched = chunks.filter((c) => Number(c.page) === page || Number(c.pageNumber) === page);
  return matched.map((chunk, i) => ({ chunk, score: 1 + matched.length - i, lex: 1 }));
}

module.exports = { tokens, retrieve, cosine, meetsEvidenceBar, unsupportedMessage, detectPageReference, retrieveByPage };
