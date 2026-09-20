/**
 * autochat/voice.js — learns how the owner texts.
 * Auto-collects the owner's outgoing messages (capped, persisted throttled)
 * plus manual `.autochat learn <line>` examples. Builds the style block.
 */
const settingsStore = require('../utils/settingsStore');

const KEY = 'autochat_voice'; // array of short example lines
const CAP = 200;

function all() {
  const v = settingsStore.get(KEY, []);
  return Array.isArray(v) ? v : [];
}

function save(v) {
  try {
    settingsStore.set(KEY, v.slice(-CAP));
  } catch { /* never break chat */ }
}

// Never learn secrets: API keys pasted in chat must not enter the voice bank.
const SECRET_RE = /\b(sk-or-v1-[A-Za-z0-9]+|AIza[0-9A-Za-z_-]{20,}|xox[bpras]-[A-Za-z0-9-]+|ghp_[A-Za-z0-9]+|gsk_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._~-]{20,})\b/;

function validSample(text) {
  const t = String(text || '').trim().slice(0, 280);
  if (!t || t.length < 2 || SECRET_RE.test(t)) return null;
  if (/^[./!#]/.test(t) || /^https?:\/\//.test(t)) return null;
  return t;
}

function sampleKey(text) {
  return String(text).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
}

// Harvest one outgoing owner message. Silent, cheap, capped, saved at once
// (owner message volume is human-scale; no throttle needed).
function collect(text) {
  const t = validSample(text);
  if (!t) return false;
  const v = all();
  if (v.some((line) => sampleKey(line) === sampleKey(t))) return false;
  v.push(t);
  if (v.length > CAP) v.splice(0, v.length - CAP);
  save(v);
  return true;
}

function learn(line) {
  // Bulk-friendly: paste many lines at once, each becomes a sample.
  const lines = String(line || '').split('\n').map(validSample).filter(Boolean);
  if (!lines.length) return 0;
  const v = all();
  let added = 0;
  for (const t of lines) {
    if (v.some((line) => sampleKey(line) === sampleKey(t))) continue;
    v.push(t);
    added += 1;
  }
  while (v.length > CAP) v.splice(0, v.length - CAP);
  save(v);
  return added;
}

function forget() {
  try {
    settingsStore.set(KEY, []);
  } catch { /* ignore */ }
}

// House flavor: curated lines in the SAME logic as taught data — short,
// capitalized, playful Sheng/English, warm, never explicit or mean.
// Supplements (never replaces) the owner's stored voice bank.
const HOUSE_VOICE = [
  'Hehe wewe ni noma 😂',
  'Sasa, ukona story?',
  'Haha umenibamba buana',
  'Eh, leo umeamua kuniwinda? 😏',
  'Poa poa, niko hapa 😌',
  'Wewe na hizo story zako 😭',
  'Aki you always know vitu',
  'Wueh, umekuja na energy 🔥',
  'Hmm, nibambe na gossip?',
  'Sawa basi, tucheze 😌',
  'Haha sawa, umeshinda leo',
  'Aki unanichekesha bure',
  'Kwani ulimiss kuwa na mimi? 😏',
  'Niko rada, niambie yote',
  'Hehe, uko na jokes leo 😂',
  'Sasa boss, mambo vipi?',
  'Aki leo umenifurahisha 🔥',
  'Haya, twende slow slow?',
  'Wewe huwa unajua kunibamba',
  'Haha pole, sikukuscan vizuri',
  'Ebu niambie, ulienda wapi?',
  'Noma sana, uko juu 😂',
  'Aki sasa umenifanya nikumiss?',
  'Poa, lakini usinicheze 😌',
  'Haha, uko na vibes zako',
  'Sasa mkurugenzi wa story, niambie 😂',
  'Niko free, what is the plan?',
  'Hehe, umejua kunishika 😏',
];

function houseLines() {
  return HOUSE_VOICE.slice();
}

function pool() {
  const stored = all();
  return stored.length ? [...stored, ...HOUSE_VOICE] : HOUSE_VOICE.slice();
}

function count() {
  return all().length;
}

function profile(lines) {
  const v = Array.isArray(lines) ? lines.filter(Boolean) : pool();
  if (!v.length) return { count: 0, medianLen: 20, emojiRate: 0.15, questionRate: 0.2, lowercaseRate: 0.5, laughterRate: 0.1 };
  const lengths = v.map((line) => line.length).sort((a, b) => a - b);
  const rate = (fn) => v.filter(fn).length / v.length;
  return {
    count: v.length,
    medianLen: lengths[Math.floor(lengths.length / 2)],
    emojiRate: rate((line) => /\p{Emoji}/u.test(line)),
    questionRate: rate((line) => /\?/.test(line)),
    lowercaseRate: rate((line) => line === line.toLowerCase()),
    laughterRate: rate((line) => /\b(?:lol|lmao|haha|hehe)\b|😂|🤣|😭/i.test(line)),
  };
}

// Representative sampling: spread evenly across the whole bank so old
// taught lines survive alongside recent auto-collected ones (newest-only
// windows forget bulk lessons the moment fresh chats arrive).
function pickSamples(v, n = 12, context = '') {
  const list = Array.isArray(v) ? v.filter(Boolean) : [];
  if (list.length <= n) return list.slice();
  const terms = new Set(String(context).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
  const scored = list.map((line, index) => {
    const words = String(line).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
    const overlap = words.filter((word) => terms.has(word)).length;
    const sameQuestion = /\?/.test(line) === /\?/.test(context) ? 1 : 0;
    const lengthFit = 1 - Math.min(1, Math.abs(line.length - String(context).length) / 200);
    return { line, index, score: overlap * 5 + sameQuestion + lengthFit + Math.random() * 0.35 };
  });
  const relevant = scored.sort((a, b) => b.score - a.score).slice(0, Math.ceil(n * 0.7));
  const remaining = scored.filter((item) => !relevant.includes(item)).sort(() => Math.random() - 0.5).slice(0, n - relevant.length);
  return [...new Set([...relevant, ...remaining].map((item) => item.line))].slice(0, n);
}

// Style block for the prompt: stats + representative examples.
// Stored lessons stay authoritative; house flavor blends the same energy.
function styleBlock({ incoming = '' } = {}) {
  const stored = all();
  const house = houseLines();
  if (!stored.length && !house.length) return 'No voice samples yet — write naturally and I will pick up the style.';
  const fromStored = stored.length ? pickSamples(stored, 10, incoming) : [];
  const fromHouse = pickSamples(house, stored.length ? Math.max(2, 14 - fromStored.length) : Math.min(14, house.length), incoming);
  const p = profile();
  return [
    `OWNER STYLE FINGERPRINT (${stored.length} taught lines + house flavor): median ${p.medianLen} chars; emoji ${Math.round(p.emojiRate * 100)}%; questions ${Math.round(p.questionRate * 100)}%; lowercase ${Math.round(p.lowercaseRate * 100)}%; laughter ${Math.round(p.laughterRate * 100)}%.`,
    'These relevant real examples are authoritative. Match their cadence, vocabulary, punctuation and restraint; never add slang absent from them:',
    ...fromStored.map((l) => `- "${l}"`),
    'House flavor in the same energy (blend in naturally, same short playful Sheng/English tone):',
    ...fromHouse.map((l) => `- "${l}"`),
  ].join('\n');
}

module.exports = { collect, learn, forget, count, profile, styleBlock, pickSamples, houseLines, pool };
