const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
const { participantPhoneJid } = require('../utils/jidResolver');

const LOCAL_CODE = '254';

module.exports = {
  name: 'foreigners',
  description: 'Lists (or removes) group members not on a Kenyan (+254) number.',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    const metadata = await sock.groupMetadata(jid);

    // LID-addressed members carry no phone number. They must never be
    // guessed as "foreign": an unresolvable LID is skipped, not punished.
    const foreigners = [];
    for (const p of metadata.participants) {
      const phoneJid = participantPhoneJid(p);
      if (!phoneJid) continue;
      const number = phoneJid.split('@')[0];
      if (!number.startsWith(LOCAL_CODE)) foreigners.push({ participant: p, number, mention: phoneJid });
    }

    if (!foreigners.length) {
      return sock.sendMessage(jid, { text: '✅ Everyone in this group is on a Kenyan number.' }, { quoted: msg });
    }

    const isRemove = args[0] === '-x';

    if (!isRemove) {
      const text = `🌍 *Non-Kenyan members (${foreigners.length}):*\n\n${foreigners.map(f => `• @${f.number}`).join('\n')}\n\n💡 Use *.foreigners -x* to remove all of them.`;
      return sock.sendMessage(jid, { text, mentions: foreigners.map(f => f.mention) }, { quoted: msg });
    }

    // Removal path — admin/bot-admin checks required
    const senderJid = msg.key.participant || msg.key.remoteJid;

    if (!isSenderAdmin(metadata, senderJid)) {
      return sock.sendMessage(jid, { text: '❌ Only group admins can remove members.' }, { quoted: msg });
    }
    if (!isBotAdmin(sock, metadata)) {
      return sock.sendMessage(jid, { text: '❌ I need to be a group admin to remove members.' }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: `🌍 Removing ${foreigners.length} non-Kenyan member(s)...` }, { quoted: msg });

    let removed = 0;
    let failed = 0;
    const batchSize = 5;
    const jids = foreigners.map(f => f.participant.id);

    for (let i = 0; i < jids.length; i += batchSize) {
      const batch = jids.slice(i, i + batchSize);
      try {
        await sock.groupParticipantsUpdate(jid, batch, 'remove');
        removed += batch.length;
      } catch (e) {
        failed += batch.length;
      }
      await new Promise(r => setTimeout(r, 1500));
    }

    await sock.sendMessage(jid, { text: `✅ Done.\nRemoved: ${removed}\nFailed: ${failed}` }, { quoted: msg });
  },
};
