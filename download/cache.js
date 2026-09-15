/**
 * download/cache.js — lightweight search-result cache (TTL + auto-clean).
 * Never caches media files.
 */
const cfg = require('./config');

const store = new Map(); // key -> { value, expires }

function key(query) {
  return String(query || '').trim().toLowerCase().slice(0, cfg.MAX_QUERY_LEN);
}

function get(query) {
  const k = key(query);
  const hit = store.get(k);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(k);
    return null;
  }
  return hit.value;
}

function set(query, value) {
  const k = key(query);
  if (!k) return;
  store.set(k, { value, expires: Date.now() + cfg.SEARCH_CACHE_TTL_MS });
  if (store.size > 200) {
    // drop oldest quarter
    const entries = [...store.entries()].sort((a, b) => a[1].expires - b[1].expires);
    for (const [ek] of entries.slice(0, 50)) store.delete(ek);
  }
}

function clean() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.expires) store.delete(k);
  }
}

setInterval(clean, 60 * 1000).unref?.();

module.exports = { get, set, clean };
