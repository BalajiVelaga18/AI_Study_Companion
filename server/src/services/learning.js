const { Concept, LearnCtx, Rec, Event } = require('../models');
const aiService = require('./ai/service');

// Legacy templates (identical strings the mock provider returns, kept as the
// last-resort fallback so recommendations never break the learning loop).
const weakTemplate = (weak) => `Focus next on ${weak.map((w) => w.concept).join(', ')} — scores dipped. Re-read the cited pages and take a short 3-question re-quiz.`;
const growthTemplate = (improved) => `Nice growth in ${improved.join(', ')}. Try application-style questions next.`;

// EMA mastery update: correct → up, wrong → down, weighted by difficulty.
async function updateMastery(projectId, ownerId, results) {
  const out = [];
  for (const r of results) {
    const c = await Concept.findOneAndUpdate(
      { projectId, name: r.concept || 'general' },
      { $setOnInsert: { ownerId, projectId, name: r.concept || 'general', mastery: 0.3 } },
      { upsert: true, new: true }
    );
    const prev = c.mastery;
    const target = r.correct ? Math.min(0.99, prev + 0.12 + (r.score || 0) / 1000) : Math.max(0.02, prev - 0.12);
    c.mastery = +(prev * 0.4 + target * 0.6).toFixed(3);
    c.history.push({ v: c.mastery, at: new Date() });
    await c.save();
    out.push({ concept: c.name, from: prev, to: c.mastery });
    await Event.create({ ownerId, projectId, type: 'mastery.update', data: { concept: c.name, from: prev, to: c.mastery } });
  }
  // Repeated-mistake → learning context + targeted recommendation
  const weak = out.filter((o) => o.to < 0.5);
  if (weak.length) {
    await LearnCtx.findOneAndUpdate({ projectId }, { $setOnInsert: { ownerId, projectId } , $addToSet: { weaknesses: { $each: weak.map((w) => w.concept) } } }, { upsert: true });
    let text = weakTemplate(weak), reason = 'weak-concept detection';
    try {
      const rec = await aiService.generateRecommendation('weak', { concepts: weak.map((w) => w.concept) });
      if (rec && rec.text) { text = rec.text; reason = rec.reason || reason; }
    } catch { /* last-resort template above keeps the loop working */ }
    await Rec.create({ ownerId, projectId, text, reason });
    await Event.create({ ownerId, projectId, type: 'recommendation', data: { text } });
  } else if (out.length) {
    const improved = out.filter((o) => o.to > o.from).map((o) => o.concept);
    if (improved.length) {
      let text = growthTemplate(improved), reason = 'growth';
      try {
        const rec = await aiService.generateRecommendation('growth', { improved });
        if (rec && rec.text) { text = rec.text; reason = rec.reason || reason; }
      } catch { /* keep template */ }
      await Rec.create({ ownerId, projectId, text, reason });
    }
  }
  return out;
}

async function growth(projectId) {
  const concepts = await Concept.find({ projectId });
  return concepts.map((c) => {
    const h = c.history.slice(-6).map((x) => x.v);
    const delta = h.length > 1 ? h[h.length - 1] - h[0] : 0;
    const trend = delta > 0.05 ? 'improving' : delta < -0.05 ? 'needs-attention' : 'stable';
    return { name: c.name, mastery: c.mastery, trend, delta: +delta.toFixed(3), history: h };
  });
}

module.exports = { updateMastery, growth };
