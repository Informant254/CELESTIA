/**
 * download/formats.js — quality menu + yt-dlp format selectors.
 * 1 Best · 2 1080p · 3 720p · 4 480p · 5 360p · 6 Audio
 * Unavailable quality -> closest available (yt-dlp fallback chain, then best).
 */
const QUALITY_MENU = [
  { n: 1, label: 'Best', kind: 'video' },
  { n: 2, label: '1080p', kind: 'video', height: 1080 },
  { n: 3, label: '720p', kind: 'video', height: 720 },
  { n: 4, label: '480p', kind: 'video', height: 480 },
  { n: 5, label: '360p', kind: 'video', height: 360 },
  { n: 6, label: 'Audio', kind: 'audio' },
];

function byNumber(n) {
  return QUALITY_MENU.find((q) => q.n === n) || null;
}

// yt-dlp -f selector: requested height first, closest below, then best.
function selectorFor(q) {
  if (!q || q.n === 1) return 'bestvideo+bestaudio/best';
  if (q.kind === 'audio') return 'bestaudio/best';
  const h = q.height;
  return `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/bestvideo+bestaudio/best`;
}

const FALLBACK_SELECTOR = 'bestvideo+bestaudio/best';

module.exports = { QUALITY_MENU, byNumber, selectorFor, FALLBACK_SELECTOR };
