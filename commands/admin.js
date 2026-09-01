module.exports = {
  name: 'admin',
  description: "Lists the group's admins.",
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    const metadata = await sock.groupMetadata(jid);
    const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');

    if (!admins.length) {
      return sock.sendMessage(jid, { text: 'ℹ️ No admins found.' }, { quoted: msg });
    }

    const text = `👑 *Group Admins:*\n\n${admins.map(a => `• @${a.id.split('@')[0]}${a.admin === 'superadmin' ? ' (owner)' : ''}`).join('\n')}`;

    await sock.sendMessage(jid, { text, mentions: admins.map(a => a.id) }, { quoted: msg });
  },
};
