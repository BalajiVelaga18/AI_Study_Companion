const test = require('node:test');
const assert = require('node:assert');
const { retrieve, tokens } = require('../src/services/retrieval');
const { tutorAnswer, gradeOpen, makeQuiz } = require('../src/services/aiProvider');
const { extractConcepts } = require('../src/services/aiProvider');

test('retrieval isolates to project chunks (no cross-project leak)', () => {
  const chunks = [{ text: 'photosynthesis chlorophyll', tokens: tokens('photosynthesis chlorophyll'), page: 1 }];
  assert.equal(retrieve('photosynthesis', chunks).length, 1);
  assert.equal(retrieve('quantum', chunks).length, 0);
});
test('tutor refuses unsupported questions', async () => {
  const out = await tutorAnswer({ question: 'moon cheese recipe?', chunks: [], context: { goal: 'biology' } });
  assert.equal(out.grounded, false);
  assert.match(out.answer, /enough evidence/i);
});
test('quiz generator mixes MCQ + open and adapts to low mastery first', () => {
  const chunks = [{ text: 'cell mitosis phases', tokens: [], page: 1, filename: 'b.pdf', materialId: 'm' }];
  const items = makeQuiz({ chunks, mastery: [{ name: 'weak-topic', mastery: 0.1 }, { name: 'strong', mastery: 0.9 }], history: [], n: 4 });
  assert.equal(items.length, 4);
  assert.ok(items[0].concept === 'weak-topic');
  assert.ok(items.some((i) => i.type === 'mcq') && items.some((i) => i.type === 'open'));
});
test('open grading explains missing concepts, not just a score', () => {
  const g = gradeOpen({ prompt: 'x', rubric: ['names the concept', 'gives example'], answer: 'too short', sourceText: 'mitosis example detail' });
  assert.ok(g.feedback.length > 20 && g.score < 60);
});
