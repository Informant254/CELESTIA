module.exports = {
  name: 'igstory',
  aliases: ['instastory', 'igstories', 'igs'],
  description: 'Download Instagram stories by username. Usage: .igstory <username>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
      return sock.sendMessage(jid, { text: '📌 Provide an Instagram username.\nExample: .igstory username' }, { quoted: msg });
    }

    const username = text.replace(/^@/, '');

    try {
      await sock.sendMessage(jid, { text: `⏳ Fetching stories for *@${username}*...` }, { quoted: msg });
      await sock.sendMessage(jid, { react: { text: '📥', key: msg.key } });

      const response = await fetch(`https://api.bk9.dev/download/igs?username=${encodeURIComponent(username)}`);
      const data = await response.json();

      if (!data.status || !data.BK9) {
        try {
          const profile = await fetch(
            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
            { headers: { 'x-ig-app-id': '936619743392459' } }
          );
          const pdata = await profile.json();
          const isPrivate = pdata?.data?.user?.is_private;
          if (isPrivate === true) {
            return sock.sendMessage(jid, { text: `🔒 *@${username}* has a private account. Stories can only be downloaded from public accounts.` }, { quoted: msg });
          }
        } catch {}
        return sock.sendMessage(jid, { text: `📭 *@${username}* has no active stories right now.` }, { quoted: msg });
      }

      const stories = data.BK9?.stories;
      if (!Array.isArray(stories) || stories.length === 0) {
        return sock.sendMessage(jid, { text: `❌ No active stories found for *@${username}*.` }, { quoted: msg });
      }

      await sock.sendMessage(jid, { text: `📖 Found *${stories.length}* stor${stories.length === 1 ? 'y' : 'ies'} for *@${username}*. Sending...` }, { quoted: msg });

      for (let i = 0; i < stories.length; i++) {
        const item = stories[i];
        const url = item?.download_url || item?.url;
        if (!url) continue;

        const caption = i === 0 ? `📸 *@${username}* stories\n_via CELESTIA_` : undefined;

        if (item.type === 'video') {
          await sock.sendMessage(jid, { video: { url }, mimetype: 'video/mp4', caption, gifPlayback: false }, { quoted: msg });
        } else {
          await sock.sendMessage(jid, { image: { url }, caption }, { quoted: msg });
        }
      }
    } catch (err) {
      await sock.sendMessage(jid, { text: '❌ Error fetching Instagram stories.' }, { quoted: msg });
    }
  },
};
