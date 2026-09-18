const express = require('express');
const { Message, Conversation } = require('../models');
const { auth, projectScope } = require('../middleware/auth');
const aiService = require('../services/ai/service');
const { answerTutorQuestion } = require('../services/tutorFlow');
const { ensureGeneralConversation } = require('../services/ai/context');
const { logAI } = require('../services/observability');

const r = express.Router();
r.use(auth);

function orphanFilter(ownerId, projectId) {
  return { ownerId, projectId, $or: [{ conversationId: null }, { conversationId: { $exists: false } }] };
}

// POST /api/learn/:projectId/tutor { question, conversationId? }
// Route → shared tutor flow → AI service → (gemini | mock). No SDK calls here.
r.post('/:projectId/tutor', projectScope, async (req, res) => {
  try {
    const { out, conversationId, concepts } = await answerTutorQuestion({
      ownerId: req.user.id,
      project: req.project,
      question: req.body.question,
      conversationId: req.body.conversationId,
    });
    res.json({ ...out, concepts, conversationId });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    if (e.status === 404) return res.status(404).json({ error: e.message });
    // Gemini-only mode failure: proper error, no stack trace, no key leakage.
    await logAI({ ownerId: req.user.id, projectId: req.project._id, feature: 'tutor', provider: 'gemini', model: aiService.defaultModel(), latencyMs: 0, tokens: 0, ok: false, error: e.category || 'error', errorCategory: e.category || 'unknown' });
    return res.status(502).json({ success: false, error: { code: 'ai_unavailable', message: aiService.userSafeMessage(e) } });
  }
});

// Conversation sessions: list WITHOUT message bodies (sidebar stays fast).
r.get('/:projectId/conversations', projectScope, async (req, res) => {
  if (await Message.exists(orphanFilter(req.user.id, req.project._id))) {
    await ensureGeneralConversation(req.user.id, req.project._id);
  }
  const convs = await Conversation.find({ ownerId: req.user.id, projectId: req.project._id }).sort({ updatedAt: -1 }).limit(50);
  res.json(convs.map((c) => ({ id: c._id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messageCount })));
});

r.post('/:projectId/conversations', projectScope, async (req, res) => {
  const title = String(req.body.title || 'New conversation').slice(0, 80) || 'New conversation';
  const c = await Conversation.create({ ownerId: req.user.id, projectId: req.project._id, title });
  res.status(201).json({ id: c._id, title: c.title, updatedAt: c.updatedAt, messageCount: 0 });
});

// Recent-first paginated messages for one conversation.
r.get('/:projectId/conversations/:cid/messages', projectScope, async (req, res) => {
  const conv = await Conversation.findById(req.params.cid);
  if (!conv || String(conv.projectId) !== String(req.project._id) || String(conv.ownerId) !== String(req.user.id)) {
    return res.status(404).json({ error: 'conversation not found' });
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const filter = { conversationId: conv._id };
  if (req.query.before) {
    const b = new Date(req.query.before);
    if (!Number.isNaN(b.getTime())) filter.createdAt = { $lt: b };
  }
  const total = await Message.countDocuments({ conversationId: conv._id });
  const msgs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1);
  const hasMore = msgs.length > limit;
  const page = msgs.slice(0, limit).reverse();
  res.json({
    conversation: { id: conv._id, title: conv.title, updatedAt: conv.updatedAt, messageCount: conv.messageCount },
    messages: page,
    hasMore: hasMore || page.length < total,
  });
});

r.patch('/:projectId/conversations/:cid', projectScope, async (req, res) => {
  const title = String(req.body.title || '').slice(0, 80).trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  const conv = await Conversation.findOneAndUpdate(
    { _id: req.params.cid, ownerId: req.user.id, projectId: req.project._id },
    { $set: { title, updatedAt: new Date() } },
    { new: true }
  );
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  res.json({ id: conv._id, title: conv.title, updatedAt: conv.updatedAt, messageCount: conv.messageCount });
});

r.delete('/:projectId/conversations/:cid', projectScope, async (req, res) => {
  const conv = await Conversation.findOneAndDelete({ _id: req.params.cid, ownerId: req.user.id, projectId: req.project._id });
  if (!conv) return res.status(404).json({ error: 'conversation not found' });
  await Message.deleteMany({ conversationId: conv._id });
  res.json({ ok: true });
});

// Legacy flat feed (kept for backward compatibility).
r.get('/:projectId/messages', projectScope, async (req, res) => {
  res.json(await Message.find({ projectId: req.project._id }).sort({ createdAt: 1 }).limit(100));
});
module.exports = r;
