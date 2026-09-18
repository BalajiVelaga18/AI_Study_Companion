// Shared Tutor request flow — used by BOTH /api/learn and /api/projects route
// mounts so behavior can never drift between them. Routes handle HTTP only:
// auth, projectScope, response shapes, and error mapping live there.
const { Chunk, Message, Concept, Event, LearnCtx } = require('../models');
const aiService = require('./ai/service');
const { buildLearningSnapshot, resolveConversation, updateConversationSummary, detectIntent } = require('./ai/context');
const { logAI } = require('./observability');

async function answerTutorQuestion({ ownerId, project, question, conversationId }) {
  const q = String(question || '').slice(0, 2000);
  if (!q) {
    const e = new Error('question required');
    e.status = 400;
    throw e;
  }
  const intent = detectIntent(q);
  const conv = await resolveConversation({ ownerId, project, conversationId, firstQuestion: q });
  // The retrieval service now loads chunks from MongoDB (vector or TF-IDF) so
  // the Tutor flow no longer needs to fetch the full corpus here.
  const [concepts, ctx, snapshot, recent] = await Promise.all([
    Concept.find({ projectId: project._id }),
    LearnCtx.findOne({ projectId: project._id }),
    buildLearningSnapshot(project._id, ownerId),
    Message.find({ conversationId: conv._id }).sort({ createdAt: -1 }).limit(8),
  ]);
  const history = [...recent].reverse().map((m) => ({ role: m.role, text: String(m.text || '') }));
  const out = await aiService.tutorResponse({
    question: q,
    projectId: project._id,
    context: {
      intent,
      goal: project.goal || project.learningGoal,
      weaknesses: ctx?.weaknesses || [],
      snapshot,
      history,
      summary: conv.summary || '',
    },
  });
  await Message.create({ ownerId, projectId: project._id, conversationId: conv._id, role: 'user', text: q });
  await Message.create({
    ownerId, projectId: project._id, conversationId: conv._id, role: 'assistant',
    text: out.answer, citations: out.citations, provider: out.provider,
    fallbackUsed: out.fallbackUsed, basis: out.basis,
  });
  conv.messageCount = (conv.messageCount || 0) + 2;
  conv.updatedAt = new Date();
  await conv.save();
  await Event.create({ ownerId, projectId: project._id, type: 'tutor.ask', data: { grounded: out.grounded, provider: out.provider, fallbackUsed: out.fallbackUsed, conversationId: conv._id } });
  await logAI({
    ownerId, projectId: project._id, feature: 'tutor',
    provider: out.provider, fallbackUsed: out.fallbackUsed, fallbackProvider: out.fallbackUsed ? 'mock' : undefined,
    model: out.model, latencyMs: out.latencyMs,
    inputTokens: out.inputTokens || 0, outputTokens: out.outputTokens || 0,
    tokens: (out.inputTokens || 0) + (out.outputTokens || 0) || (((q.length + String(out.answer || '').length) / 4) | 0),
    ok: true,
  });
  // Rolling memory update — never blocks the reply.
  updateConversationSummary(conv._id, aiService.aiConfig().primary === 'gemini');
  return { out, conversationId: conv._id, concepts: concepts.map((c) => ({ name: c.name, mastery: c.mastery })) };
}

module.exports = { answerTutorQuestion };
