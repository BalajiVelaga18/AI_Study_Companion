// Spec-compatible aliases: POST /api/projects/:id/tutor, quiz, mastery, growth,
// recommendations, conversations, materials, analytics. All enforce ownership
// via projectScope (never cross-project). Delegates to the same services.
const express = require('express');
const { Material, Concept, Rec, Message, Conversation } = require('../models');
const { auth, projectScope } = require('../middleware/auth');
const aiService = require('../services/ai/service');
const { answerTutorQuestion } = require('../services/tutorFlow');
const { ensureGeneralConversation } = require('../services/ai/context');
const { updateMastery, growth } = require('../services/learning');
const { logAI } = require('../services/observability');
const { Chunk, Quiz, Event, LearnCtx } = require('../models');

const r = express.Router();
r.use(auth);

function pid(req) { return req.project._id; }

// Tutor (spec: POST /api/projects/:id/tutor) — same shared flow as /api/learn.
r.post('/projects/:projectId/tutor', projectScope, async (req, res) => {
  try {
    const { out, conversationId } = await answerTutorQuestion({
      ownerId: req.user.id,
      project: req.project,
      question: req.body.question || req.body.message,
      conversationId: req.body.conversationId,
    });
    res.json({ success: true, data: { ...out, conversationId } });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ success: false, error: { code: 'invalid_input', message: e.message } });
    if (e.status === 404) return res.status(404).json({ success: false, error: { code: 'not_found', message: e.message } });
    await logAI({ ownerId: req.user.id, projectId: pid(req), feature: 'tutor', provider: 'gemini', model: aiService.defaultModel(), latencyMs: 0, tokens: 0, ok: false, error: e.category || 'error', errorCategory: e.category || 'unknown' });
    return res.status(502).json({ success: false, error: { code: 'ai_unavailable', message: aiService.userSafeMessage(e) } });
  }
});

// Conversation session aliases (same ownership guarantees as /api/learn).
r.get('/projects/:projectId/conversations', projectScope, async (req, res) => {
  if (await Message.exists({ ownerId: req.user.id, projectId: pid(req), $or: [{ conversationId: null }, { conversationId: { $exists: false } }] })) {
    await ensureGeneralConversation(req.user.id, pid(req));
  }
  const convs = await Conversation.find({ ownerId: req.user.id, projectId: pid(req) }).sort({ updatedAt: -1 }).limit(50);
  res.json({ success: true, data: convs.map((c) => ({ id: c._id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messageCount })) });
});
r.post('/projects/:projectId/conversations', projectScope, async (req, res) => {
  const title = String(req.body.title || 'New conversation').slice(0, 80) || 'New conversation';
  const c = await Conversation.create({ ownerId: req.user.id, projectId: pid(req), title });
  res.status(201).json({ success: true, data: { id: c._id, title: c.title, updatedAt: c.updatedAt, messageCount: 0 } });
});
r.get('/projects/:projectId/conversations/:cid/messages', projectScope, async (req, res) => {
  const conv = await Conversation.findById(req.params.cid);
  if (!conv || String(conv.projectId) !== String(pid(req)) || String(conv.ownerId) !== String(req.user.id)) {
    return res.status(404).json({ success: false, error: { code: 'not_found', message: 'conversation not found' } });
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const filter = { conversationId: conv._id };
  if (req.query.before) {
    const b = new Date(req.query.before);
    if (!Number.isNaN(b.getTime())) filter.createdAt = { $lt: b };
  }
  const total = await Message.countDocuments({ conversationId: conv._id });
  const msgs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1);
  const page = msgs.slice(0, limit).reverse();
  res.json({ success: true, data: { conversation: { id: conv._id, title: conv.title, updatedAt: conv.updatedAt, messageCount: conv.messageCount }, messages: page, hasMore: msgs.length > limit || page.length < total } });
});

// Conversations (spec: GET /api/projects/:id/conversations)
r.get('/projects/:projectId/conversations', projectScope, async (req, res) => {
  const msgs = await Message.find({ projectId: pid(req) }).sort({ createdAt: 1 }).limit(100);
  res.json({ success: true, data: [{ id: 'default', projectId: pid(req), messages: msgs }] });
});

// Quiz (spec: POST /api/projects/:id/quiz)
r.post('/projects/:projectId/quiz', projectScope, async (req, res) => {
  try {
    const chunks = await Chunk.find({ projectId: pid(req) }).limit(200);
    const mastery = await Concept.find({ projectId: pid(req) });
    const ctx = await LearnCtx.findOne({ projectId: pid(req) });
    const out = await aiService.generateQuiz({ chunks, mastery, history: ctx?.mistakes || [], n: req.body.n || 5 });
    const quiz = await Quiz.create({ ownerId: req.user.id, projectId: pid(req), items: out.items, answers: [] });
    await Event.create({ ownerId: req.user.id, projectId: pid(req), type: 'quiz.start', data: { quizId: quiz._id, provider: out.provider, fallbackUsed: out.fallbackUsed } });
    res.json({ success: true, data: { quizId: quiz._id, items: out.items.map(({ correctIndex, ...rest }) => rest), provider: out.provider, fallbackUsed: out.fallbackUsed } });
  } catch (e) {
    return res.status(502).json({ success: false, error: { code: 'ai_unavailable', message: aiService.userSafeMessage(e) } });
  }
});

// Quiz answer/complete aliases (spec: POST /api/quizzes/:id/answer)
async function answerQuiz(req, res) {
  const quiz = await Quiz.findOne({ _id: req.params.quizId, projectId: pid(req) });
  if (!quiz || quiz.completed) return res.status(400).json({ success: false, error: { code: 'invalid_quiz', message: 'invalid quiz' } });
  const { itemId, answer } = req.body;
  const item = quiz.items.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ success: false, error: { code: 'not_found', message: 'item not found' } });
  let correct = false, score = 0, feedback = '', fallbackUsed = false;
  if (item.type === 'mcq') {
    correct = Number(answer) === item.correctIndex;
    score = correct ? 100 : 0;
    feedback = correct ? 'Correct — matches the cited material.' : `Not quite. The supported answer is option ${item.correctIndex + 1}. Re-read the citation (p.${item.source?.page ?? '?'}).`;
    quiz.answers.push({ itemId, answer, score, correct, feedback });
  } else {
    try {
      const chunks = await Chunk.find({ projectId: pid(req) }).limit(50);
      const g = await aiService.evaluateAssessment({ prompt: item.prompt, rubric: item.rubric, answer: String(answer || ''), sourceText: chunks.map((c) => c.text).join(' ').slice(0, 5000) });
      score = g.score; correct = g.score >= 60; feedback = g.feedback; fallbackUsed = g.fallbackUsed;
      quiz.answers.push({ itemId, answer, ...g, correct });
    } catch (e) {
      return res.status(502).json({ success: false, error: { code: 'ai_unavailable', message: aiService.userSafeMessage(e) } });
    }
  }
  await updateMastery(pid(req), req.user.id, [{ concept: item.concept, correct, score }]);
  if (!correct) await LearnCtx.findOneAndUpdate({ projectId: pid(req) }, { $setOnInsert: { ownerId: req.user.id, projectId: pid(req) }, $addToSet: { mistakes: item.concept } }, { upsert: true });
  await Event.create({ ownerId: req.user.id, projectId: pid(req), type: 'question.answer', data: { itemId, correct, score, fallbackUsed } });
  await quiz.save();
  res.json({ success: true, data: { correct, score, feedback, fallbackUsed } });
}
r.post('/projects/:projectId/quiz/:quizId/answer', projectScope, answerQuiz);
r.post('/quizzes/:quizId/answer', async (req, res, next) => {
  // resolve project from quiz with ownership check
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz || quiz.ownerId.toString() !== req.user.id) return res.status(404).json({ success: false, error: { code: 'not_found', message: 'quiz not found' } });
  req.project = { _id: quiz.projectId };
  return answerQuiz(req, res);
});
async function completeQuiz(req, res) {
  const quiz = await Quiz.findOne({ _id: req.params.quizId, projectId: pid(req) });
  if (!quiz) return res.status(404).json({ success: false, error: { code: 'not_found', message: 'not found' } });
  quiz.completed = true;
  quiz.score = quiz.answers.length ? Math.round(quiz.answers.reduce((s, a) => s + (a.score || 0), 0) / quiz.answers.length) : 0;
  await quiz.save();
  await Event.create({ ownerId: req.user.id, projectId: pid(req), type: 'quiz.complete', data: { quizId: quiz._id, score: quiz.score } });
  res.json({ success: true, data: { score: quiz.score, growth: await growth(pid(req)) } });
}
r.post('/projects/:projectId/quiz/:quizId/complete', projectScope, completeQuiz);
r.post('/quizzes/:quizId/complete', async (req, res) => {
  const quiz = await Quiz.findById(req.params.quizId);
  if (!quiz || quiz.ownerId.toString() !== req.user.id) return res.status(404).json({ success: false, error: { code: 'not_found', message: 'quiz not found' } });
  req.project = { _id: quiz.projectId };
  return completeQuiz(req, res);
});

// Mastery / growth / recommendations / analytics (spec GETs)
r.get('/projects/:projectId/mastery', projectScope, async (req, res) => {
  res.json({ success: true, data: await growth(pid(req)) });
});
r.get('/projects/:projectId/growth', projectScope, async (req, res) => {
  res.json({ success: true, data: await growth(pid(req)) });
});
r.get('/projects/:projectId/recommendations', projectScope, async (req, res) => {
  res.json({ success: true, data: await Rec.find({ projectId: pid(req) }).sort({ createdAt: -1 }).limit(10) });
});
r.get('/projects/:projectId/materials', projectScope, async (req, res) => {
  res.json({ success: true, data: await Material.find({ projectId: pid(req) }).sort({ createdAt: -1 }) });
});
r.get('/projects/:projectId/analytics', projectScope, async (req, res) => {
  const [events, quizzes, recs, msgs] = await Promise.all([
    Event.find({ projectId: pid(req) }).sort({ at: -1 }).limit(50),
    Quiz.find({ projectId: pid(req) }).sort({ createdAt: -1 }).limit(10),
    Rec.find({ projectId: pid(req) }).sort({ createdAt: -1 }).limit(5),
    Message.countDocuments({ projectId: pid(req) }),
  ]);
  res.json({ success: true, data: { growth: await growth(pid(req)), quizzes, recs, activity: events, tutorMessages: msgs } });
});

module.exports = r;
