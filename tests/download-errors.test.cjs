const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classify, isRetryable } = require('../download/errors');

test('YouTube blocks and rate limits have explicit non-retry categories', () => {
  assert.equal(classify(new Error('HTTP Error 403: Forbidden')), 'YOUTUBE_BLOCKED');
  assert.equal(classify(new Error("Sign in to confirm you're not a bot")), 'YOUTUBE_BLOCKED');
  assert.equal(classify(new Error('HTTP Error 429: Too Many Requests')), 'RATE_LIMITED');
  assert.equal(isRetryable(new Error('HTTP Error 403: Forbidden')), false);
  assert.equal(isRetryable(new Error('HTTP Error 429: Too Many Requests')), false);
});

test('YouTube circuit opens after bounded consecutive blocks', () => {
  delete require.cache[require.resolve('../download/fallback')];
  const fallback = require('../download/fallback');
  const now = Date.now();
  assert.equal(fallback.youtubeCircuitOpen(now), false);
  fallback.recordYouTubeResult('YOUTUBE_BLOCKED', now);
  fallback.recordYouTubeResult('RATE_LIMITED', now);
  assert.equal(fallback.youtubeCircuitOpen(now), false);
  fallback.recordYouTubeResult('YOUTUBE_BLOCKED', now);
  assert.equal(fallback.youtubeCircuitOpen(now), true);
  assert.equal(fallback.youtubeCircuitOpen(now + 11 * 60 * 1000), false);
});
