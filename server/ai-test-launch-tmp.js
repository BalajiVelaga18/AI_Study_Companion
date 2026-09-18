// TEMP demo-failure harness (deleted after verification). In-memory DB +
// gemini-primary/mock-fallback with simulated quota failure — no API key needed.
// NOTE: run with the real .env moved aside so MONGO_URI is unset.
process.env.AI_PROVIDER = 'gemini';
process.env.AI_FALLBACK_PROVIDER = 'mock';
process.env.GEMINI_SIMULATE_FAILURE = 'true';
process.env.GEMINI_SIMULATE_ERROR = 'quota_exceeded';
process.env.PORT = '4012';
require('./src/index.js');
