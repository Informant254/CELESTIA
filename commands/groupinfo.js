function formatTimestamp(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return {
    day: days[d.getDay()],
    date: d.getDate(),
    month: months[d.getMonth()],
    year: d.getFullYear(),
    time: d.toLocaleTimeString('en-US'),
  };
}

module.exports = {
  name: 'groupinfo',
  aliases: ['gcinfo', 'gcprofile'],
  description: 'Shows info about the current group.',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ *This command only works in groups.*' }, { quoted: msg });
    }

    try {
      const info = await sock.groupMetadata(jid);
      const ts = formatTimestamp(info.creation);

      let pp;
      try {
        pp = await sock.profilePictureUrl(jid, 'image');
      } catch {
        pp = 'https://files.catbox.moe/t03s77.jpg';
      }

      const membersCount = info.participants.filter(p => p.admin == null).length;
      const adminsCount = info.participants.length - membersCount;

      const caption =
        `_Name_ : *${info.subject}*\n\n` +
        `_ID_ : *${info.id}*\n\n` +
        `_Group owner_ : ${'@' + (info.owner || '').split('@')[0]}\n\n` +
        `_Group created_ : *${ts.day}, ${ts.date} ${ts.month} ${ts.year}, ${ts.time}*\n\n` +
        `_Participants_ : *${info.size}*\n` +
        `_Members_ : *${membersCount}*\n\n` +
        `_Admins_ : *${adminsCount}*\n\n` +
        `_Who can send message_ : *${info.announce ? 'Admins' : 'Everyone'}*\n\n` +
        `_Who can edit group info_ : *${info.restrict ? 'Admins' : 'Everyone'}*\n\n` +
        `_Who can add participants_ : *${info.memberAddMode ? 'Everyone' : 'Admins'}*`;

      await sock.sendMessage(jid, {
        image: { url: pp },
        caption,
        mentions: info.owner ? [info.owner] : [],
      }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(jid, { text: `❌ *Failed to fetch group info: ${e.message}*` }, { quoted: msg });
    }
  },
};
