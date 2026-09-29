/**
 * autochat/voice.js — learns how the owner texts.
 * Auto-collects the owner's outgoing messages (capped, persisted)
 * plus manual `.autochat learn <line>` examples. Builds the style block.
 *
 * NOVAHEX baseline: distilled from a user-supplied WhatsApp export. Only
 * harmless owner-side style examples live here; no contact messages, secrets,
 * links, media, or intimate/private conversation content are embedded.
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
  // Owner texts are short bursts — long technical paragraphs teach the
  // wrong register (essays, error logs, command drafts).
  if (t.length > 140 || t.includes('\n\n')) return null;
  return t;
}

function sampleKey(text) {
  return String(text).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
}

// Harvest one outgoing owner message. Silent, cheap, capped, saved at once.
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

// Stable baseline distilled from the owner's WhatsApp export. Keeping this
// separate from the mutable bank prevents restarts / bot-generated messages
// from slowly washing out the owner's real cadence.
const HOUSE_VOICE = [
  'Rada, uko aje 😏',
  'Mambo aje 😂',
  'Morning 😂',
  'Sawa basi 😂',
  'Eeh basi 😂',
  'Eeh ndio 😂',
  'Fiti tu 😌',
  'Tulia 😅',
  'Kiasi nirudi 😅',
  'Kwani ni same time 😅',
  'Bythaa online class ni saa ngapi 😏',
  'Kuna notes ya hizi stuff 😏🥱',
  'Nitumie swali 🥱😏',
  'Wacha nilale niamke baadaye 😏🥱',
  'Angalia email yako 😂',
  'Uko na lapy 😏',
  'Tuingie slack',
  'Wacha nitume hizo pdf slack',
  'Uskii ndiyo nadai kupiga revision 😂',
  'Hkn 😂😂',
  'Gni hizo 🥱😏',
  'Ni ngumu 😅😏',
  'Yenye unataka 🥱😏',
  'Siku copy 😅😏',
  'Pleeeese 🥹🥹',
  'Nishikie space 🤩😂',
  'Nitatuma kesho 😂😏',
  'Sio bot 😂😏',
  'Exactly 😂 no more confusion now 😏',
  'I guess ni partnership 😂😅',
  'Leo tumalizane na linear algebra 😂',
  'Eeh online basi 😂',
  'Wacha nitegee cat ndiyo nikuwe serious 🥱😏',
  'Kuna wenye wamearn?? 😂',
  'Vile hiyo sticker ni elite 🥱',
  'So sahi mnafanya nn 😂',
  'Ulikuwa unafanya 😏',
  'Unalala saa ngapi 😏',
  'Notes zimetumwa???',
  'Usichoke 🥱',
];

// Aggregate traits from the export, expressed as behavior rather than private
// chat facts. This is more useful to the model than hundreds of copied lines.
const NOVAHEX_RULES = [
  'Write like fast phone chat, not polished prose. Short bursts beat full paragraphs.',
  'Natural code-switching: Sheng/Swahili + English in the same line when it fits.',
  'Common rhythms include: bythaa, wacha, sawa basi, eeh, kwani, uko, ndiyo/ndio, sahi, gni, nn.',
  'Preferred reactions are 😂 and 😏, then 🥱 😅 🤩. Use emojis naturally, not on every sentence.',
  'Playful/direct beats overly sweet or overly formal. Tease lightly; do not sound like customer support.',
  'Questions are occasional, not automatic. Often react or make a short statement instead.',
  'Do not force generic Nairobi filler like “aki”, “hehe”, “wueh” or “gossip” unless the live chat actually uses it.',
  'Keep imperfect shorthand only where it feels natural. Never manufacture random typos just to look human.',
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

// Representative sampling: favor context-relevant examples, then add a little
// variation so the model does not turn one phrase into a verbal disease.
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
  const remaining = scored
    .filter((item) => !relevant.includes(item))
    .sort(() => Math.random() - 0.5)
    .slice(0, n - relevant.length);
  return [...new Set([...relevant, ...remaining].map((item) => item.line))].slice(0, n);
}

// Style block for the prompt: mutable lessons + stable NOVAHEX baseline.
// Fresh owner messages still outrank the baseline, but the baseline never
// disappears completely just because the runtime bank has grown large.
function styleBlock({ incoming = '' } = {}) {
  const stored = all();
  const house = houseLines();
  if (!stored.length && !house.length) return 'No voice samples yet — write naturally and I will pick up the style.';

  const mergedProfile = profile(stored.length ? [...stored, ...house] : house);
  const fromStored = stored.length ? pickSamples(stored, 10, incoming) : [];
  const baselineCount = stored.length < 12 ? Math.max(2, 14 - fromStored.length) : 4;
  const fromHouse = pickSamples(house, baselineCount, incoming);

  const lines = [
    `OWNER STYLE FINGERPRINT (${stored.length} taught lines): median ${mergedProfile.medianLen} chars; emoji ${Math.round(mergedProfile.emojiRate * 100)}%; questions ${Math.round(mergedProfile.questionRate * 100)}%; lowercase ${Math.round(mergedProfile.lowercaseRate * 100)}%; laughter ${Math.round(mergedProfile.laughterRate * 100)}%.`,
    'NOVAHEX STYLE RULES (distilled from the owner-provided chat export):',
    ...NOVAHEX_RULES.map((rule) => `- ${rule}`),
  ];

  if (fromStored.length) {
    lines.push('These taught owner examples are authoritative. Match their cadence, vocabulary, punctuation and restraint:');
    lines.push(...fromStored.map((l) => `- "${l}"`));
  }

  if (stored.length < 12) {
    // Keep the historical label because command output/tests already use it.
    lines.push('House flavor in the same energy (NOVAHEX baseline; blend naturally):');
  } else {
    lines.push('NOVAHEX baseline examples (use as a stable accent, not a script):');
  }
  lines.push(...fromHouse.map((l) => `- "${l}"`));

  return lines.join('\n');
}

module.exports = {
  collect,
  learn,
  forget,
  count,
  profile,
  styleBlock,
  pickSamples,
  houseLines,
  pool,
};
