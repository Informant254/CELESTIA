const LANG_NAMES = {
  en: 'English', sw: 'Swahili', fr: 'French', es: 'Spanish', de: 'German',
  ar: 'Arabic', hi: 'Hindi', pt: 'Portuguese', nl: 'Dutch', it: 'Italian',
  ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', tr: 'Turkish',
  am: 'Amharic', yo: 'Yoruba', ig: 'Igbo', ha: 'Hausa', zu: 'Zulu',
  xh: 'Xhosa', so: 'Somali', rw: 'Kinyarwanda', fr2: 'French', el: 'Greek',
  he: 'Hebrew', id: 'Indonesian', ms: 'Malay', th: 'Thai', vi: 'Vietnamese',
  tl: 'Filipino', ur: 'Urdu', bn: 'Bengali', ta: 'Tamil', te: 'Telugu',
  pl: 'Polish', uk: 'Ukrainian', ro: 'Romanian', sv: 'Swedish', no: 'Norwegian',
  da: 'Danish', fi: 'Finnish', hu: 'Hungarian', cs: 'Czech', sk: 'Slovak',
  auto: 'auto-detect',
};

const langName = (code) => LANG_NAMES[String(code || '').toLowerCase()] || String(code || 'unknown').toUpperCase();
const isLangCode = (s) => /^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(String(s || '').trim());

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

async function viaGoogle(text, to) {
  const translate = require('@iamtraction/google-translate');
  const res = await withTimeout(translate(text, { from: 'auto', to }), 20000, 'google translate');
  if (!res || !String(res.text || '').trim()) throw new Error('empty translation');
  return { text: res.text.trim(), from: res?.from?.language?.iso || 'auto' };
}

async function viaMyMemory(text, to) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${encodeURIComponent(to)}`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`mymemory http ${res.status}`);
    const data = await res.json();
    const out = String(data?.responseData?.translatedText || '').trim();
    if (!out) throw new Error(data?.responseDetails || 'empty translation');
    // MyMemory returns error strings inside translatedText on quota breaches.
    if (/query length limit|invalid email|too many requests/i.test(data?.responseDetails || '')) {
      throw new Error(data.responseDetails);
    }
    return { text: out, from: 'auto' };
  } finally {
    clearTimeout(timer);
  }
}

function splitLong(text, max = 1500) {
  if (text.length <= max) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

module.exports = {
  name: 'trt',
  description: 'Translate text. Reply with .trt [lang] or use .trt [lang] <text> (default: English).',

  async execute(sock, msg, args = []) {
    const jid = msg.key.remoteJid;
    const send = (text) => sock.sendMessage(jid, { text }, { quoted: msg });

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';

    // Parse optional leading language code from args.
    let to = 'en';
    let rest = [...args];
    if (rest.length && isLangCode(rest[0]) && (quotedText || rest.length > 1)) {
      to = rest.shift().toLowerCase();
    }
    let text = (quotedText || rest.join(' ')).trim();
    // Bare ".trt swahili text..." — accept a full language name as first word.
    if (!quotedText && rest.length > 1) {
      const maybeName = String(rest[0]).toLowerCase();
      const code = Object.keys(LANG_NAMES).find((k) => LANG_NAMES[k].toLowerCase() === maybeName);
      if (code) {
        to = code;
        text = rest.slice(1).join(' ').trim();
      }
    }

    if (!text) {
      return send('❌ Reply to a message with `.trt [lang]`, or use `.trt [lang] <text>`.\nExample: `.trt sw Hujambo, unaendeleaje?`');
    }
    if (text.length > 4000) {
      return send('❌ That text is too long (4000 char max). Split it and translate in parts.');
    }

    try {
      const chunks = splitLong(text);
      const out = [];
      let from = 'auto';
      for (const chunk of chunks) {
        let result = null;
        let lastError = null;
        try {
          result = await viaGoogle(chunk, to);
        } catch (e) {
          lastError = e;
          try {
            result = await viaMyMemory(chunk, to);
          } catch (e2) {
            lastError = e2;
          }
        }
        if (!result) throw lastError || new Error('translation failed');
        from = result.from || from;
        out.push(result.text);
      }
      await send(`🌐 *Translation*\n🏳️ From: ${langName(from)}\n🏳️ To: ${langName(to)}\n\n${out.join(' ')}`);
    } catch (err) {
      console.error('[TRT ERROR]', err?.message || err);
      await send(`❌ Translation failed: ${String(err?.message || err).slice(0, 140)}`);
    }
  },
};
