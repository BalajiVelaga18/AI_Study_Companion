# Evaluation

Rule-based harness, no external keys: `npm --workspace server run eval` (`services/evaluation.js`). Unit tests: `npm --workspace server run test`.

| Area | Check | Current |
|---|---|---|
| Tutor grounded | known question → `grounded:true` + ≥1 citation with page | ✅ pass |
| Tutor unsupported | off-topic question → `grounded:false` + "enough evidence" | ✅ pass |
| Retrieval | "overfitting regularization" ranks page-3 chunk first | ✅ pass |
| Grading | short answer → score<60 + feedback naming covered/missing | ✅ pass |
| Isolation | query term absent → zero hits (no cross-project leak) | ✅ pass (unit) |
| Adaptive selection | lowest-mastery concept first, MCQ+open mix | ✅ pass (unit) |

Admin → AI evaluation tab shows live `% grounded` across `tutor.ask` events + pointer to the harness. Regressions (prompt/threshold/retrieval changes) flip these checks — that is the point: prompts, models, and retrieval are versioned against the same cases.
