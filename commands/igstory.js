const { detectMediaType, downloadBuffer } = require('../utils/downloader');
const cfg = require('../download/config');
const queue = require('../download/queue');

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

      const response = await fetch(
        `https://api.bk9.dev/download/igs?username=${encodeURIComponent(username)}`,
        { signal: AbortSignal.timeout(60000) }
      );
      if (!response.ok) throw new Error(`Story provider returned HTTP ${response.status}.`);
      const data = await response.json();

      if (!data.status || !data.BK9) {
        try {
          const profile = await fetch(
            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
            { headers: { 'x-ig-app-id': '936619743392459' }, signal: AbortSignal.timeout(15000) }
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

      const owner = `${jid}:${msg.key.participant || jid}`;
      await queue.run(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error('Overall request timeout exceeded.')), cfg.DOWNLOAD_TIMEOUT_MS);
        if (timeout.unref) timeout.unref();
        try {
          for (let i = 0; i < stories.length; i++) {
            const item = stories[i];
            const url = item?.download_url || item?.url;
            if (!url) continue;

            const caption = i === 0 ? `📸 *@${username}* stories\n_via CELESTIA_` : undefined;
            const buffer = await downloadBuffer(url, cfg.MAX_VIDEO_BYTES, 120000, 5, controller.signal);
            const type = detectMediaType(buffer, url) || item.type;
            if (type === 'video') {
              await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', caption, gifPlayback: false }, { quoted: msg });
            } else if (type === 'image') {
              await sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg });
            } else {
              throw new Error('Story provider returned unrecognized media.');
            }
          }
          return {};
        } finally {
          clearTimeout(timeout);
        }
      }, owner);
    } catch (err) {
      await sock.sendMessage(jid, { text: '❌ Error fetching Instagram stories.' }, { quoted: msg });
    }
  },
};
