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

function namesFrom(mentions, args) {
  const names = [];
  for (const mention of mentions) {
    if (!/^\d+@/.test(mention)) continue;
    const number = mention.split('@')[0].replace(/\D/g, '');
    if (number.length < 7) continue;
    names.push(`+${number}`);
  }
  if (names.length < 2) {
    names.length = 0;
    for (const arg of args) {
      const cleaned = String(arg || '').replace(/@/g, '').trim();
      if (!cleaned || !/^[\p{L}\p{N} _.'-]{1,24}$/u.test(cleaned)) continue;
      names.push(cleaned);
      if (names.length === 2) break;
    }
  }
  return names.slice(0, 2);
}

module.exports = {
  name: 'ship',
  aliases: ['compat', 'match'],
  description: 'Ship two people and get the compatibility score. Usage: .ship <@user1 @user2 | name1 name2>',
  scorePair, barFor, verdictFor, namesFrom,
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });
    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const names = namesFrom(mentions, args);
    if (names.length !== 2) {
      return reply('📌 Ship *two people* by mentioning them or typing two names.\nExample: .ship @alice @bob');
    }
    const score = scorePair(names[0], names[1]);
    await reply(
      `💘 *${names[0]} × ${names[1]}*\n\n`
      + `${barFor(score)} *${score}%*\n\n${verdictFor(score)}\n\n_via CELESTIA_`,
    );
  },
};
