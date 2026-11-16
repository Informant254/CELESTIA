const { resolvePhoneJid } = require('../utils/jidResolver');
const BAR_LENGTH = 10;

function scorePair(first, second) {
  const pair = [first.toLowerCase(), second.toLowerCase()].sort().join('\u0000');
  let hash = 5381;
  for (const byte of Buffer.from(pair, 'utf8')) hash = ((hash * 33) ^ byte) >>> 0;
  return 55 + (hash % 46);
}

function verdictFor(score) {
  if (score >= 90) return '💞 *Destined.* Book the venue.';
  if (score >= 80) return '🔥 *Dangerously cute* together.';
  if (score >= 65) return '✨ *Strong match* — the vibes align.';
  return '🌱 *A little spark.* Keep it growing.';
}

function barFor(score) {
  const filled = Math.max(1, Math.round((score / 100) * BAR_LENGTH));
  return '❤️'.repeat(filled) + '🖤'.repeat(BAR_LENGTH - filled);
}

async function targets(sock, msg, args) {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const out = [];
  for (const raw of mentioned.slice(0, 2)) {
    if (out.length === 2) break;
    let resolved;
    try { resolved = await resolvePhoneJid(sock, msg, raw); } catch { resolved = null; }
    const jid = String(resolved?.jid || '');
    if (!resolved?.resolved || !jid.endsWith('@s.whatsapp.net')) continue;
    out.push({ label: `@${jid.split('@')[0]}`, mentionJid: jid });
  }
  if (out.length < 2) {
    out.length = 0;
    for (const arg of args) {
      const cleaned = String(arg || '').replace(/@/g, '').trim();
      if (!cleaned || !/^[\p{L}\p{N} _.'-]{1,24}$/u.test(cleaned)) continue;
      out.push({ label: cleaned });
      if (out.length === 2) break;
    }
  }
  return out.slice(0, 2);
}

module.exports = {
  name: 'ship',
  aliases: ['compat', 'match'],
  description: 'Ship two people and get the compatibility score. Usage: .ship <@user1 @user2 | name1 name2>',
  scorePair, barFor, verdictFor, targets,
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });
    const pair = await targets(sock, msg, args);
    if (pair.length !== 2) {
      return reply('📌 Ship *two people* by mentioning them or typing two names.\nExample: .ship @alice @bob');
    }
    const same = pair[0].mentionJid && pair[0].mentionJid === pair[1].mentionJid;
    const verdict = same
      ? '💞 *You cannot ship someone with themselves...* 100% (self-love counts)'
      : `${barFor(scorePair(pair[0].label, pair[1].label))} *${scorePair(pair[0].label, pair[1].label)}%*\n\n${verdictFor(scorePair(pair[0].label, pair[1].label))}`;
    const text = `💘 *${pair[0].label} × ${pair[1].label}*\n\n${verdict}\n\n_via CELESTIA_`;
    const mentions = pair.map(item => item.mentionJid).filter(Boolean);
    await sock.sendMessage(jid, mentions.length >= 2 ? { text, mentions } : { text }, { quoted: msg });
  },
};
