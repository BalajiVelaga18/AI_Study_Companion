const express = require('express');
const { Chunk, Quiz, Concept, Event, LearnCtx } = require('../models');
const { auth, projectScope } = require('../middleware/auth');
const aiService = require('../services/ai/service');
const { updateMastery, growth } = require('../services/learning');
const { logAI } = require('../services/observability');

const r = express.Router();
r.use(auth);

r.post('/:projectId/quiz/start', projectScope, async (req, res) => {
  try {
    const chunks = await Chunk.find({ projectId: req.project._id }).limit(200);
    const mastery = await Concept.find({ projectId: req.project._id });
    const ctx = await LearnCtx.findOne({ projectId: req.project._id });
    const history = await Quiz.find({ projectId: req.project._id }).sort({ createdAt: -1 }).limit(3);
    const out = await aiService.generateQuiz({ chunks, mastery, history: ctx?.mistakes || [], n: req.body.n || 5 });
    const quiz = await Quiz.create({ ownerId: req.user.id, projectId: req.project._id, items: out.items, answers: [] });
    await Event.create({ ownerId: req.user.id, projectId: req.project._id, type: 'quiz.start', data: { quizId: quiz._id, provider: out.provider, fallbackUsed: out.fallbackUsed, fallbackReason: out.fallbackReason } });
    // strip correct answers for client
    res.json({ quizId: quiz._id, items: out.items.map(({ correctIndex, ...rest }) => rest), provider: out.provider, fallbackUsed: out.fallbackUsed, fallbackReason: out.fallbackReason });
  } catch (e) {
    return res.status(502).json({ success: false, error: { code: 'ai_unavailable', message: aiService.userSafeMessage(e) } });
  }
});

r.post('/:projectId/quiz/:quizId/answer', projectScope, async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.quizId, projectId: req.project._id });
  if (!quiz || quiz.completed) return res.status(400).json({ error: 'invalid quiz' });
  const { itemId, answer } = req.body;
  const item = quiz.items.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: 'item not found' });
  let correct = false, score = 0, feedback = '', provider = 'local', fallbackUsed = false;
  if (item.type === 'mcq') {
    correct = Number(answer) === item.correctIndex;
    score = correct ? 100 : 0;
    feedback = correct ? 'Correct — matches the cited material.' : `Not quite. The supported answer is option ${item.correctIndex + 1}. Re-read the citation (p.${item.source?.page ?? '?'}).`;
  } else {
    try {
      const chunks = await Chunk.find({ projectId: req.project._id }).limit(50);
      const g = await aiService.evaluateAssessment({ prompt: item.prompt, rubric: item.rubric, answer: String(answer || ''), sourceText: chunks.map((c) => c.text).join(' ').slice(0, 5000) });
      score = g.score; correct = g.score >= 60; feedback = g.feedback;
      provider = g.provider; fallbackUsed = g.fallbackUsed;
      quiz.answers.push({ itemId, answer, ...g });
    } catch (e) {
      return res.status(502).json({ success: false, error: { code: 'ai_unavailable', message: aiService.userSafeMessage(e) } });
    }
  }
  if (item.type === 'mcq') quiz.answers.push({ itemId, answer, score, correct, feedback });
  // live mastery update per answer (event-driven)
  await updateMastery(req.project._id, req.user.id, [{ concept: item.concept, correct, score }]);
  if (!correct) await LearnCtx.findOneAndUpdate({ projectId: req.project._id }, { $setOnInsert: { ownerId: req.user.id, projectId: req.project._id }, $addToSet: { mistakes: item.concept } }, { upsert: true });
  await Event.create({ ownerId: req.user.id, projectId: req.project._id, type: 'question.answer', data: { itemId, correct, score, provider, fallbackUsed } });
  await logAI({ ownerId: req.user.id, projectId: req.project._id, feature: 'quiz.grade', provider, fallbackUsed, model: provider === 'local' ? 'local' : undefined, latencyMs: 5, tokens: 200, ok: true });
  await quiz.save();
  res.json({ correct, score, feedback, fallbackUsed });
});

r.post('/:projectId/quiz/:quizId/complete', projectScope, async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.quizId, projectId: req.project._id });
  if (!quiz) return res.status(404).json({ error: 'not found' });
  quiz.completed = true;
  quiz.score = quiz.answers.length ? Math.round(quiz.answers.reduce((s, a) => s + (a.score || 0), 0) / quiz.answers.length) : 0;
  await quiz.save();
  await Event.create({ ownerId: req.user.id, projectId: req.project._id, type: 'quiz.complete', data: { quizId: quiz._id, score: quiz.score } });
  const g = await growth(req.project._id);
  res.json({ score: quiz.score, growth: g });
});

r.get('/:projectId/mastery', projectScope, async (req, res) => {
  res.json(await growth(req.project._id));
});
module.exports = r;
