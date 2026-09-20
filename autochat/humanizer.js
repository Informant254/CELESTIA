/**
 * autochat/humanizer.js — human timing: read pause, typing presence,
 * length-based type delay, multi-bubble splitting. Pure timing, no AI.
 */
const WPM = 105; // brisk phone typing; provider latency already consumed time

function readDelayMs(incomingLen) {
  // skim short texts fast, actually read long ones
  const ms = 350 + Math.min(incomingLen, 400) * 3 + Math.random() * 650;
  return Math.round(Math.min(ms, 2800));
}

function typeDelayMs(replyLen) {
  const words = Math.max(1, String(replyLen).split(/\s+/).length);
  const ms = (words / WPM) * 60000 * (0.85 + Math.random() * 0.5);
  return Math.round(Math.min(Math.max(ms, 450), 8000));
}

// Long replies arrive as 2-3 bubbles like a real person, not one wall.
function chunk(text) {
  const t = String(text || '').trim();
  if (t.length <= 150) return [t];
  const sentences = t.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [t];
  const parts = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length > 180 && cur) {
      parts.push(cur.trim());
      cur = s;
    } else {
      cur = (cur + ' ' + s).trim();
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  if (parts.length > 3) {
    const head = parts.slice(0, 2);
    head.push(parts.slice(2).join(' '));
    return head.slice(0, 3);
  }
  if (parts.length === 1 && t.length > 180) {
    return [t.slice(0, 150).trim(), t.slice(150).trim()].filter(Boolean);
  }
  return parts.length ? parts : [t];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function presence(sock, jid, kind, ms) {
  try {
    await sock.sendPresenceUpdate(kind, jid);
  } catch { /* cosmetic */ }
  await sleep(ms);
}

module.exports = { readDelayMs, typeDelayMs, chunk, sleep, presence };
