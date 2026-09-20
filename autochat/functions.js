/**
 * autochat/functions.js — lets AI personalities OPERATE bot functions.
 *
 * A model runs a function by emitting exactly one tag in its reply:
 *   [FUNC imagine: a purple wolf under stars]
 * The dispatcher executes the matching bot command with the argument text,
 * then delivers the model's remaining chat text. One call per reply max.
 *
 * Safety: fixed allowlist of generative, non-destructive, text-in commands
 * only. No moderation, admin, group-setting, or session commands — those can
 * never be triggered, and the model is told they do not exist as functions.
 */
const ALLOW = Object.freeze({
  imagine: { max: 500, desc: 'generate an AI image from a description' },
  video: { max: 300, desc: 'generate a short AI video clip from a scene description' },
  aisticker: { max: 300, desc: 'generate a WhatsApp sticker from a description' },
  tts: { max: 500, desc: 'read text aloud as a voice note' },
});

function toolBlock() {
  const list = Object.entries(ALLOW).map(([name, spec]) => `${name} (${spec.desc})`).join(', ');
  return [
    'FUNCTIONS — you can operate the bot by emitting at most ONE tag per reply, exactly like: [FUNC imagine: a purple wolf under stars].',
    `Available functions: ${list}.`,
    'Rules: emit a tag only when they asked for an image, video, sticker, or voice readout (or it clearly continues the thread). Keep the argument short and self-contained. Put normal chat text outside the tag. Moderation, admin, kick, ban, block, and settings actions do NOT exist as functions — never emit tags for them.',
  ].join('\n');
}

function extract(text) {
  const raw = String(text || '');
  const m = raw.match(/\[FUNC\s+([a-z]+)\s*:\s*([^\]]{1,1200})\]/i);
  if (!m) return { func: null, arg: null, clean: raw };
  const func = m[1].toLowerCase();
  if (!ALLOW[func]) return { func: null, arg: null, clean: raw };
  const arg = m[2].trim().slice(0, ALLOW[func].max);
  if (!arg) return { func: null, arg: null, clean: raw };
  const clean = raw.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
  return { func, arg, clean };
}

async function run(sock, msg, commands, func, arg) {
  if (!func || !ALLOW[func]) return false;
  const cmd = commands && typeof commands.get === 'function' ? commands.get(func) : null;
  if (!cmd || typeof cmd.execute !== 'function') return false;
  const args = String(arg || '').trim().split(/\s+/).filter(Boolean);
  if (!args.length) return false;
  const jid = msg.key.remoteJid;
  const reply = (content, options = {}) => sock.sendMessage(
    jid,
    typeof content === 'string' ? { text: content } : content,
    { quoted: msg, ...options }
  );
  await cmd.execute(sock, msg, args, commands, reply);
  return true;
}

module.exports = { ALLOW, toolBlock, extract, run };
