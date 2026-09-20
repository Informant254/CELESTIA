const settingsStore = require('../utils/settingsStore');

const KEY = 'autochat_flirt_numbers';

function normalize(value) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function list() {
  const value = settingsStore.get(KEY, []);
  return Array.isArray(value) ? [...new Set(value.map(normalize).filter(Boolean))] : [];
}

function add(value) {
  const number = normalize(value);
  if (!/^\d{7,15}$/.test(number)) return false;
  const values = list();
  if (!values.includes(number)) settingsStore.set(KEY, [...values, number]);
  return true;
}

function remove(value) {
  const number = normalize(value);
  const before = list();
  settingsStore.set(KEY, before.filter((item) => item !== number));
  return before.includes(number);
}

function clear() {
  settingsStore.set(KEY, []);
}

function candidates(msg) {
  return [msg?.key?.remoteJidAlt, msg?.key?.remoteJid, msg?.key?.participantPn, msg?.key?.participantAlt]
    .map(normalize).filter(Boolean);
}

function isAllowed(msg) {
  const jid = String(msg?.key?.remoteJid || '');
  if (jid.endsWith('@g.us') || jid === 'status@broadcast') return false;
  const allowed = new Set(list());
  return candidates(msg).some((number) => allowed.has(number));
}

module.exports = { normalize, list, add, remove, clear, candidates, isAllowed };
