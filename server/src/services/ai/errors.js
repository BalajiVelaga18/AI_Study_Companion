// Provider error taxonomy. ONLY a ProviderError with an eligible category may
// trigger Mock fallback. Programming errors (bad args, DB, authz) are thrown as
// plain Errors and must NEVER be hidden behind fallback.
class ProviderError extends Error {
  constructor({ provider = 'gemini', category = 'unknown', message = 'provider error', status = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.category = category;
    this.status = status;
  }
}

// Quota/auth/availability/timeout/network/bad-payload → eligible for fallback.
const FALLBACK_ELIGIBLE = new Set([
  'not_configured', // GEMINI_API_KEY missing (only falls back if a fallback is configured)
  'auth', // invalid/unauthorized key
  'rate_limited',
  'quota_exceeded',
  'timeout',
  'network',
  'unavailable',
  'server_error',
  'model_not_found', // unknown/retired model id — fix GEMINI_MODEL, no retry
  'invalid_response', // provider returned unusable output (logged, then fallback)
]);

// Only transient faults get ONE retry with backoff. Quota/auth/config never retry.
const RETRYABLE = new Set(['timeout', 'network', 'unavailable', 'server_error', 'rate_limited']);

function isFallbackEligibleError(e) {
  return e instanceof ProviderError && FALLBACK_ELIGIBLE.has(e.category);
}

function isRetryableError(e) {
  return e instanceof ProviderError && RETRYABLE.has(e.category);
}

module.exports = { ProviderError, isFallbackEligibleError, isRetryableError, FALLBACK_ELIGIBLE };
