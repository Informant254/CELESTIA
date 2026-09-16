/**
 * autochat/humanizer.js — human timing: read pause, typing presence,
 * length-based type delay, multi-bubble splitting. Pure timing, no AI.
 */
const WPM = 45; // human texting speed baseline

function readDelayMs(incomingLen) {
  // skim short texts fast, actually read long ones
  const ms = 800 + Math.min(incomingLen, 400) * 6 + Math.random() * 1200;
  return Math.round(Math.min(ms, 6000));
}

function typeDelayMs(replyLen) {
  const words = Math.max(1, String(replyLen).split(/\s+/).length);
  const ms = (words / WPM) * 60000 * (0.85 + Math.random() * 0.5);
  return Math.round(Math.min(Math.max(ms, 1500), 25000));
}

// Long replies arrive as 2-3 bubbles like a real person, not one wall.
function chunk(text) {
  const t = String(text || '').trim();
  if (t.length <= 160) return [t];
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
    if (parts.length === 2) break;
  }
  if (cur.trim()) parts.push(cur.trim());
  if (parts.length > 3) {
    const head = parts.slice(0, 2);
    head.push(parts.slice(2).join(' '));
    return head.slice(0, 3);
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
