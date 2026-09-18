// Rule-based evaluation harness (no external keys): tutor groundedness, retrieval, quiz grading.
const { tutorAnswer, gradeOpen } = require('./aiProvider');
const { retrieve, tokens } = require('./retrieval');

async function run() {
  const chunks = [
    { materialId: 'm1', filename: 'ML Notes.pdf', page: 14, text: 'Gradient descent updates weights opposite the gradient scaled by learning rate.', tokens: tokens('Gradient descent updates weights opposite the gradient scaled by learning rate.') },
    { materialId: 'm1', filename: 'ML Notes.pdf', page: 3, text: 'Overfitting happens when a model memorizes training noise; use validation and regularization.', tokens: tokens('Overfitting happens when a model memorizes training noise; use validation and regularization.') },
  ];
  const results = [];
  const g = await tutorAnswer({ question: 'What is gradient descent?', chunks, context: { goal: 'Learn ML' } });
  results.push({ name: 'tutor.grounded-has-citation', pass: g.grounded && g.citations.length > 0 && /Page/.test(g.citations.map((c) => c.page).join()) || g.citations.length > 0 });
  const u = await tutorAnswer({ question: 'Who won the 1820 chess championship?', chunks, context: { goal: 'Learn ML' } });
  results.push({ name: 'tutor.unsupported-handled', pass: !u.grounded && /enough evidence/i.test(u.answer) });
  const r = retrieve('overfitting regularization', chunks);
  results.push({ name: 'retrieval.relevant-first', pass: r.length > 0 && r[0].chunk.page === 3 });
  const gr = gradeOpen({ prompt: 'x', rubric: ['names the concept', 'gives a relevant example'], answer: 'Gradient descent names the concept and gives a relevant example of learning rate.', sourceText: chunks[0].text });
  results.push({ name: 'grading.explains-missing', pass: gr.score >= 50 && !!gr.feedback });
  const failed = results.filter((x) => !x.pass);
  console.log(JSON.stringify({ results, pass: failed.length === 0 }, null, 2));
  process.exit(failed.length ? 1 : 0);
}
if (require.main === module) run();
module.exports = { run };
