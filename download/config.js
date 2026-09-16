/**
 * download/config.js — tunables (env-overridable).
 */
module.exports = {
  // search sessions live 5 minutes
  SESSION_TTL_MS: parseInt(process.env.DL_SESSION_TTL_MS || '', 10) || 5 * 60 * 1000,
  // search result cache lives 10 minutes
  SEARCH_CACHE_TTL_MS: parseInt(process.env.DL_SEARCH_CACHE_MS || '', 10) || 10 * 60 * 1000,
  SEARCH_RESULTS: parseInt(process.env.DL_SEARCH_RESULTS || '', 10) || 3,
  // downloads at the same time
  MAX_CONCURRENT_DOWNLOADS: parseInt(process.env.DL_MAX_CONCURRENT || '', 10) || 2,
  // silent fallback budgets (never infinite)
  MAX_SEARCH_ATTEMPTS: parseInt(process.env.DL_MAX_SEARCH || '', 10) || 3,
  MAX_DOWNLOAD_ATTEMPTS: parseInt(process.env.DL_MAX_ATTEMPTS || '', 10) || 3,
  MAX_RESULT_FALLBACKS: parseInt(process.env.DL_MAX_RESULTS || '', 10) || 3,
  MAX_FORMAT_FALLBACKS: parseInt(process.env.DL_MAX_FORMATS || '', 10) || 4,
  // global ceiling per user request (kills runaway jobs)
  DOWNLOAD_TIMEOUT_MS: parseInt(process.env.DL_TIMEOUT_MS || '', 10) || 30 * 60 * 1000,
  // WhatsApp upload guardrails (generous — WhatsApp itself may still
  // refuse giant uploads; audio mixes are far smaller than video)
  MAX_VIDEO_BYTES: parseInt(process.env.DL_MAX_VIDEO_BYTES || '', 10) || 1073741824, // 1 GB
  MAX_AUDIO_BYTES: parseInt(process.env.DL_MAX_AUDIO_BYTES || '', 10) || 1073741824, // 1 GB
  // yt-dlp: max 3 overall attempts, never infinite
  YTDLP_MAX_ATTEMPTS: 3,
  YTDLP_SOCKET_TIMEOUT: 30,
  // hard ceiling per download attempt (kills stalled spawns)
  YTDLP_OVERALL_TIMEOUT_MS: parseInt(process.env.DL_OVERALL_TIMEOUT_MS || '', 10) || 25 * 60 * 1000,
  // max length of a user search query
  MAX_QUERY_LEN: 200,
};
