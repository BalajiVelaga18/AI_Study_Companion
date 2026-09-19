import React, { useState } from 'react';
import { api } from '../../lib/api.js';

export default function Quiz({ projectId, onComplete }) {
  const [quizId, setQuizId] = useState(null);
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openAnswer, setOpenAnswer] = useState('');

  const start = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setQuizId(null);
    setItems([]);
    setAnswers([]);
    setCurrent(0);
    setOpenAnswer('');
    try {
      const data = await api(`/api/quiz/${projectId}/quiz/start`, {
        method: 'POST',
        body: JSON.stringify({ n: 5 }),
      });
      setQuizId(data.quizId);
      setItems(data.items || []);
    } catch (err) {
      setError(err.message || 'Could not start quiz.');
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async (value) => {
    if (loading || !quizId) return;
    const item = items[current];
    setLoading(true);
    try {
      const res = await api(`/api/quiz/${projectId}/quiz/${quizId}/answer`, {
        method: 'POST',
        body: JSON.stringify({ itemId: item.id, answer: value }),
      });
      setAnswers((prev) => [
        ...prev,
        { item, yourAnswer: value, correct: res.correct, score: res.score, feedback: res.feedback },
      ]);
    } catch (err) {
      setError(err.message || 'Could not submit answer.');
    } finally {
      setLoading(false);
      setOpenAnswer('');
    }
  };

  const finish = async () => {
    if (!quizId) return;
    setLoading(true);
    try {
      const res = await api(`/api/quiz/${projectId}/quiz/${quizId}/complete`, {
        method: 'POST',
        body: '{}',
      });
      setResult(res);
      if (onComplete) onComplete();
    } catch (err) {
      setError(err.message || 'Could not finish quiz.');
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="card">
        <p className="form-error">{error}</p>
        <button onClick={start}>Try again</button>
      </div>
    );
  }

  if (result) {
    return (
      <div className="card quiz-result">
        <h3>Quiz complete</h3>
        <div className="quiz-score">{result.score}%</div>
        <p>{result.score >= 70 ? 'Great job!' : result.score >= 40 ? 'Keep practicing.' : 'Review the material and try again.'}</p>
        <button onClick={start}>Retake quiz</button>
        <div className="quiz-review">
          {answers.map((a, i) => (
            <div key={i} className={`review-item ${a.correct ? 'correct' : 'wrong'}`}>
              <div className="review-q">{i + 1}. {a.item.prompt}</div>
              <div className="review-a">Your answer: {Array.isArray(a.yourAnswer) ? a.yourAnswer.join(', ') : String(a.yourAnswer)}</div>
              <div className="review-feedback">{a.feedback}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card">
        <h3>Adaptive Quiz</h3>
        <p>Answer a few questions and get feedback tied to your project material.</p>
        <button onClick={start} disabled={loading}>
          {loading ? 'Loading…' : 'Start quiz'}
        </button>
      </div>
    );
  }

  const item = items[current];
  const progress = Math.round(((current) / items.length) * 100);

  return (
    <div className="card quiz-card">
      <div className="quiz-progress"><div className="quiz-progress-bar" style={{ width: `${progress}%` }} /></div>
      <div className="quiz-meta">Question {current + 1} of {items.length}</div>

      <div className="quiz-prompt">{item.prompt}</div>
      <div className="quiz-concept">{item.concept} · {item.difficulty}</div>

      {item.type === 'mcq' ? (
        <div className="quiz-options">
          {item.options.map((opt, idx) => (
            <button
              key={idx}
              className="quiz-option"
              onClick={() => submitAnswer(idx)}
              disabled={loading}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="quiz-open">
          <textarea
            rows={4}
            value={openAnswer}
            onChange={(e) => setOpenAnswer(e.target.value)}
            placeholder="Type your answer..."
            disabled={loading}
          />
          <button onClick={() => submitAnswer(openAnswer)} disabled={loading || !openAnswer.trim()}>
            {loading ? 'Submitting…' : 'Submit answer'}
          </button>
        </div>
      )}

      {answers.length > current && (
        <div className={`quiz-feedback ${answers[current].correct ? 'correct' : 'wrong'}`}>
          <strong>{answers[current].correct ? 'Correct' : 'Not quite'}</strong>
          <p>{answers[current].feedback}</p>
          {current < items.length - 1 ? (
            <button onClick={() => setCurrent(current + 1)}>Next question</button>
          ) : (
            <button onClick={finish} disabled={loading}>
              {loading ? 'Finishing…' : 'Finish quiz'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
