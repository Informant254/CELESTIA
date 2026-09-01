module.exports = {
  name: 'user',
  description: 'Shows your WhatsApp number, name, and profile picture.',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const id = senderJid.split('@')[0].split(':')[0];
    const isLid = senderJid.endsWith('@lid');
    const pushName = msg.pushName || 'Unknown';

    const text = isLid
      ? `👤 *Your Info*\n\n🆔 ID: ${id}\n📛 Name: ${pushName}\n\n(Your real number is hidden by WhatsApp's privacy settings in this chat.)`
      : `👤 *Your Info*\n\n📱 Number: ${id}\n📛 Name: ${pushName}`;

    try {
      const profilePicUrl = await sock.profilePictureUrl(senderJid, 'image');
      await sock.sendMessage(
        jid,
        { image: { url: profilePicUrl }, caption: text },
        { quoted: msg }
      );
    } catch (error) {
      await sock.sendMessage(
        jid,
        { text: `${text}\n\n(No profile picture available.)` },
        { quoted: msg }
      );
    }
  },
};
