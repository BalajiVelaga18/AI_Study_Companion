// Tutor context engine: intent routing, learning snapshots, conversation memory.
// Pure helpers (detectIntent, makeTitle, composers) are unit-tested; DB helpers
// assemble only the context relevant to the current request — never everything.
const { Concept, LearnCtx, Quiz, Event, Conversation, Message } = require('../../models');

// ---- intent detection (deterministic keyword rules, ordered by specificity) ----
const INTENT_RULES = [
  ['weakness', /weak(?:ness|est)?|struggl|stuck on|where am i (going )?wrong|what (should|do) i (focus|work|practice)|focus (on|next)|am i behind|gaps? in (my|me)/],
  ['simplify', /simpl|eli5|beginner|layman|like i.?m (5|five)|dumb (it )?down|in plain|too (hard|complex|technical)/],
  ['example', /example|instance|illustrat|sample|show me|walk ?through|demonstrat/],
  ['revise', /revis|review|recap|test me|quiz me|summary of|catch ?up|refresh my memory|prepare me/],
];
function detectIntent(question) {
  const q = String(question || '').toLowerCase();
  for (const [intent, re] of INTENT_RULES) if (re.test(q)) return intent;
  return 'ask';
}

// ---- learning snapshot: only the slices relevant to tutoring, all capped ----
async function buildLearningSnapshot(projectId, ownerId) {
  const [concepts, ctx, quizzes, events] = await Promise.all([
    Concept.find({ projectId }).sort({ mastery: 1 }).limit(12),
    LearnCtx.findOne({ projectId }),
    Quiz.find({ projectId, completed: true }).sort({ createdAt: -1 }).limit(5),
    Event.find({ projectId, type: { $in: ['question.answer', 'quiz.complete', 'tutor.ask'] } }).sort({ at: -1 }).limit(10),
  ]);
  const weak = concepts.filter((c) => c.mastery < 0.5).slice(0, 5).map((c) => ({ name: c.name, mastery: c.mastery }));
  const strong = [...concepts].sort((a, b) => b.mastery - a.mastery).slice(0, 3).map((c) => ({ name: c.name, mastery: c.mastery }));
  return {
    weak,
    strong,
    mistakes: (ctx?.mistakes || []).slice(-8),
    recentQuizzes: quizzes.map((q) => ({ score: q.score, at: q.createdAt })),
    recentActivity: events.map((e) => ({ type: e.type, at: e.at })),
    ownerId: ownerId ? String(ownerId) : undefined,
  };
}

function hasLearningEvidence(snap) {
  if (!snap) return false;
  return (snap.weak && snap.weak.length > 0)
    || (snap.mistakes && snap.mistakes.length > 0)
    || (snap.recentQuizzes && snap.recentQuizzes.length > 0);
}

function snapshotText(snap) {
  if (!snap) return '';
  const parts = [];
  if (snap.weak?.length) parts.push(`Weak (<50% mastery): ${snap.weak.map((w) => `${w.name} (${Math.round(w.mastery * 100)}%)`).join(', ')}`);
  if (snap.strong?.length) parts.push(`Strong: ${snap.strong.map((s) => s.name).join(', ')}`);
  if (snap.mistakes?.length) parts.push(`Repeated mistakes: ${snap.mistakes.join(', ')}`);
  if (snap.recentQuizzes?.length) parts.push(`Recent quiz scores: ${snap.recentQuizzes.map((q) => q.score).join(', ')}`);
  return parts.join(' | ').slice(0, 1200);
}

// Deterministic weakness answer (mock mode + gemini fallback — identical output).
function composeWeaknessAnswer(snap, goal) {
  if (!hasLearningEvidence(snap)) {
    return 'I don\'t have enough learning evidence yet to judge your weak areas — no quizzes, assessments, or tracked mistakes in this project so far. Take a short quiz first, then ask me again.';
  }
  const lines = [];
  const top = snap.weak[0];
  if (top) {
    lines.push(`**${top.name}** is currently one of your weaker areas (estimated mastery ${Math.round(top.mastery * 100)}%).`);
  } else if (snap.mistakes?.length) {
    lines.push(`You have repeated mistakes in **${snap.mistakes.slice(0, 3).join(', ')}**.`);
  }
  const extra = [];
  if (snap.weak?.length > 1) extra.push(`Also watch: ${snap.weak.slice(1, 3).map((w) => w.name).join(', ')}.`);
  if (snap.recentQuizzes?.length) {
    const avg = Math.round(snap.recentQuizzes.reduce((s, q) => s + q.score, 0) / snap.recentQuizzes.length);
    extra.push(`Recent quiz average: ${avg}%.`);
  }
  if (extra.length) lines.push(extra.join(' '));
  const focus = top ? top.name : (snap.mistakes[0] || 'the weakest concept');
  lines.push(`**Suggested next step:** review ${focus}${goal ? ` (goal: ${goal})` : ''} in your materials and take a short assessment on it.`);
  return lines.join('\n\n');
}

// Human-readable title from the first user question (no LLM call needed).
function makeTitle(question) {
  const clean = String(question || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'New conversation';
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + '…';
}

// Extractive summary for mock mode (deterministic; Gemini mode uses the LLM).
function makeMockSummary(firstQuestion, weakNames) {
  const bits = [];
  if (firstQuestion) bits.push(`Started by asking: "${String(firstQuestion).slice(0, 140)}"`);
  if (weakNames?.length) bits.push(`Known struggles: ${weakNames.slice(0, 4).join(', ')}`);
  return bits.join('. ') || 'General study discussion.';
}

// ---- conversation sessions (reuse Message docs; no duplicate storage) ----
async function ensureGeneralConversation(ownerId, projectId) {
  let conv = await Conversation.findOne({ ownerId, projectId, title: 'General' });
  if (!conv) conv = await Conversation.create({ ownerId, projectId, title: 'General' });
  // Adopt pre-session orphan messages so no history is lost.
  const orphans = await Message.updateMany(
    { ownerId, projectId, $or: [{ conversationId: null }, { conversationId: { $exists: false } }] },
    { $set: { conversationId: conv._id } }
  );
  if (orphans.modifiedCount) {
    conv.messageCount = await Message.countDocuments({ conversationId: conv._id });
    await conv.save();
  }
  return conv;
}

async function resolveConversation({ ownerId, project, conversationId, firstQuestion }) {
  if (conversationId) {
    const conv = await Conversation.findById(conversationId);
    if (!conv || String(conv.projectId) !== String(project._id) || String(conv.ownerId) !== String(ownerId)) {
      const err = new Error('conversation not found');
      err.status = 404;
      throw err;
    }
    return conv;
  }
  const latest = await Conversation.findOne({ ownerId, projectId: project._id }).sort({ updatedAt: -1 });
  if (latest) return latest;
  await ensureGeneralConversation(ownerId, project._id);
  const general = await Conversation.findOne({ ownerId, projectId: project._id, title: 'General' });
  if (general && !(await Message.exists({ conversationId: general._id }))) {
    general.title = makeTitle(firstQuestion);
    await general.save();
  }
  return general;
}

// Rolling summary: once a thread is long, summarize everything but the last 8
// messages. Fire-and-forget from the route (never blocks the reply).
async function updateConversationSummary(conversationId, geminiMode) {
  try {
    const conv = await Conversation.findById(conversationId);
    if (!conv || conv.messageCount < 14 || conv.messageCount - (conv.summaryCount || 0) < 10) return;
    const older = await Message.find({ conversationId }).sort({ createdAt: 1 }).limit(Math.max(0, conv.messageCount - 8));
    if (!older.length) return;
    let summary = '';
    if (geminiMode) {
      try {
        const gemini = require('./providers/gemini.provider');
        const s = await gemini.summarizeThread({
          currentSummary: conv.summary,
          messages: older.slice(-20).map((m) => ({ role: m.role, text: String(m.text || '').slice(0, 500) })),
        });
        summary = s.text;
      } catch { summary = ''; }
    }
    if (!summary) {
      const firstQ = older.find((m) => m.role === 'user');
      summary = makeMockSummary(firstQ?.text, []);
    }
    conv.summary = String(summary).slice(0, 1500);
    conv.summaryCount = conv.messageCount;
    await conv.save();
  } catch (e) {
    console.log('[AI] summary update skipped:', e.message);
  }
}

module.exports = {
  detectIntent,
  buildLearningSnapshot,
  hasLearningEvidence,
  snapshotText,
  composeWeaknessAnswer,
  makeTitle,
  makeMockSummary,
  ensureGeneralConversation,
  resolveConversation,
  updateConversationSummary,
};
