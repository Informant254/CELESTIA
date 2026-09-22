/**
 * utils/pairCode.js — fast pairing-code fetch shared by .pair and .pair2.
 *
 * The old flow was three serial round trips (usync lookup → ack message →
 * code request) with no timeouts, so one slow WhatsApp reply hung the whole
 * command. Now:
 *   - number lookup is best-effort with a short cap; on timeout we proceed
 *     anyway because requestPairingCode itself validates the number.
 *   - the code request has a hard cap and a clear "try again" error.
 * Commands overlap the "Requesting..." ack send with the code request.
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)),
  ]);
}

async function fetchPairingCode(sock, number, opts = {}) {
  const lookupMs = opts.lookupMs || 12000;
  const codeMs = opts.codeMs || 30000;

  try {
    const res = await withTimeout(sock.onWhatsApp(`${number}@s.whatsapp.net`), lookupMs, 'Number lookup');
    if (res && res[0] && res[0].exists === false) {
      const err = new Error(`${number} is not registered on WhatsApp.`);
      err.code = 'NOT_REGISTERED';
      throw err;
    }
  } catch (e) {
    if (e.code === 'NOT_REGISTERED') throw e;
    // Lookup stalled (usync flakiness) — proceed; the code request validates.
  }

  const code = await withTimeout(sock.requestPairingCode(number), codeMs, 'Pairing code request');
  if (!code) throw new Error('No pairing code returned.');
  return code;
}

module.exports = { fetchPairingCode, withTimeout };
