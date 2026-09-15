/**
 * download/strategies.js — the ordered silent attempt plan.
 * Bounded by MAX_DOWNLOAD_ATTEMPTS. Stops at first success.
 */
const cfg = require('./config');
const { selectorFor, FALLBACK_SELECTOR } = require('./formats');

const ANDROID = ['--extractor-args', 'youtube:player_client=android'];

function videoStrategies(quality) {
  const wanted = selectorFor(quality);
  const list = [{ name: 'primary', selector: wanted, extra: [] }];
  if (wanted !== FALLBACK_SELECTOR) {
    list.push({ name: 'alternate-client', selector: wanted, extra: ANDROID });
  }
  list.push({ name: 'closest-available', selector: FALLBACK_SELECTOR, extra: ANDROID });
  return list.slice(0, cfg.MAX_DOWNLOAD_ATTEMPTS);
}

function audioStrategies() {
  return [
    { name: 'primary', audio: true, selector: null, extra: [] },
    { name: 'alternate-client', audio: true, selector: null, extra: ANDROID },
  ].slice(0, cfg.MAX_DOWNLOAD_ATTEMPTS);
}

module.exports = { videoStrategies, audioStrategies };
