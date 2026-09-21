/**
 * download/strategies.js — the ordered silent attempt plan.
 * Bounded by MAX_DOWNLOAD_ATTEMPTS. Stops at first success.
 */
const cfg = require('./config');
const { selectorFor, FALLBACK_SELECTOR } = require('./formats');

function videoStrategies(quality) {
  const wanted = selectorFor(quality);
  const list = [{ name: 'primary', selector: wanted, extra: [] }];
  if (wanted !== FALLBACK_SELECTOR) {
    list.push({ name: 'closest-available', selector: FALLBACK_SELECTOR, extra: [] });
  }
  return list.slice(0, cfg.MAX_DOWNLOAD_ATTEMPTS);
}

function audioStrategies() {
  return [{ name: 'primary', audio: true, selector: null, extra: [] }];
}

module.exports = { videoStrategies, audioStrategies };
