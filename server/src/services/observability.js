const { AIUsage } = require('../models');
async function logAI(fields) {
  try {
    const inputTokens = fields.inputTokens || 0;
    const outputTokens = fields.outputTokens || 0;
    const tokens = fields.tokens || inputTokens + outputTokens || 0;
    await AIUsage.create({
      ...fields,
      tokens,
      inputTokens: fields.inputTokens,
      outputTokens: fields.outputTokens,
      costUsd: tokens * 0.000002, // heuristic estimate for both providers
      at: new Date(),
    });
  } catch {}
}
module.exports = { logAI };
