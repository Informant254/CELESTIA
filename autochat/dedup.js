/**
 * autochat/dedup.js — one message, one answer.
 *
 * WhatsApp/Baileys redelivers the same message when decryption fails and
 * recovers (Bad MAC storms, history replays, reconnect replays). Without a
 * guard each delivery runs the full brain chain, so two deliveries can win
 * with two different providers — the "she replies twice, differently" bug.
 *
 * claim(ns, chatId, msgId) returns true for the FIRST delivery, false for
 * repeats inside the TTL. Namespaces keep sequential same-delivery calls
 * (aimodes → autochat) from blocking each other: each handler dedups only
 * its own repeats.
 */
const seen = new Map(); // `${ns}::${chatId}::${msgId}` -> first-seen epoch ms
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 5000;

function claim(ns, chatId, msgId) {
  if (!msgId) return true; // no id — nothing to dedup against, allow
  const key = `${ns}::${chatId}::${msgId}`;
  const now = Date.now();
  const prev = seen.get(key);
  if (prev !== undefined && now - prev < TTL_MS) return false;
  seen.set(key, now);
  if (seen.size > MAX_ENTRIES) {
    for (const [k, ts] of seen) {
      if (now - ts >= TTL_MS) seen.delete(k);
      if (seen.size <= MAX_ENTRIES) break;
    }
    if (seen.size > MAX_ENTRIES) seen.delete(seen.keys().next().value);
  }
  return true;
}

function _size() { return seen.size; }

module.exports = { claim, TTL_MS, _size };
