const { detectMediaType, downloadBuffer } = require('../utils/downloader');
const cfg = require('../download/config');
const queue = require('../download/queue');

module.exports = {
  name: 'meme',
  aliases: ['memes', 'lol'],
  description: 'Send a random trending meme. Usage: .meme [subreddit]',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });
    const subject = String(args[0] || '').replace(/^r\//i, '').trim();
    if (subject && !/^[A-Za-z0-9_-]{2,24}$/.test(subject)) {
      return reply('📌 Use a subreddit name like *memes* or *dankmemes*.\nExample: .meme memes');
    }
    let progress;
    try {
      progress = await reply(`⏳ Fetching ${subject ? `r/${subject}` : 'a trending meme'}...`);
      const owner = `${jid}:${msg.key.participant || jid}`;
      await queue.run(async () => {
        const signal = AbortSignal.timeout(Math.min(cfg.DOWNLOAD_TIMEOUT_MS, 60000));
        const endpoint = subject
          ? `https://meme-api.com/gimme/${encodeURIComponent(subject)}/1`
          : 'https://meme-api.com/gimme';
        const response = await fetch(endpoint, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const media = Array.isArray(data?.memes) ? data.memes[0] : data;
        if (typeof media?.url !== 'string' || !/^https:\/\//.test(media.url)) {
          throw new Error('The meme provider returned no image.');
        }
        const buffer = await downloadBuffer(media.url, cfg.MAX_VIDEO_BYTES, 60000, 3, signal);
        const type = detectMediaType(buffer);
        if (!type) throw new Error('The meme provider returned a page instead of an image.');
        const caption = `😂 *${media.title || 'Meme'}*\nr/${media.subreddit || subject || 'memes'}\n${media.postLink || ''}\n_via CELESTIA_`.trim();
        if (type === 'video') await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: msg });
        else await sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg });
        await sock.sendMessage(jid, { text: '✅ Done!', edit: progress.key });
        return {};
      }, owner);
    } catch (error) {
      const text = error.code === 'QUEUE_FULL' ? error.message : 'The meme request failed or timed out. Please try again later.';
      if (progress?.key) await sock.sendMessage(jid, { text: `❌ ${text}`, edit: progress.key });
      else await reply(`❌ ${text}`);
    }
  },
};
