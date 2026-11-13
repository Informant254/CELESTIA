const { detectMediaType, downloadBuffer } = require('../utils/downloader');
const { target, fetchStories } = require('../utils/instagramStories');
const cfg = require('../download/config');
const queue = require('../download/queue');

module.exports = {
  name: 'igstory',
  aliases: ['instastory', 'igstories', 'igs'],
  description: 'Download Instagram stories. Usage: .igstory <username, profile URL or story URL>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });
    let input;
    try { input = target(args[0]); }
    catch (error) { return reply(`📌 ${error.message}\nExample: .igstory https://www.instagram.com/username/`); }
    const { username, storyId } = input;
    let progress;
    try {
      progress = await reply(`⏳ Fetching stories for *@${username}*...`);
      const owner = `${jid}:${msg.key.participant || jid}`;
      await queue.run(async () => {
        const signal = AbortSignal.timeout(Math.min(cfg.DOWNLOAD_TIMEOUT_MS, 5 * 60 * 1000));
        const result = await fetchStories(username, signal);
        const stories = storyId ? result.stories.filter(item => item.id === storyId) : result.stories;
        if (!stories.length) {
          const text = storyId
            ? `📭 That story is not available to ${result.authenticated ? 'the configured Instagram session' : 'the public provider'}; it may have expired.`
            : `📭 No active stories were returned for *@${username}* by ${result.authenticated ? 'the configured Instagram session' : 'the public provider'}.`;
          await sock.sendMessage(jid, { text, edit: progress.key });
          return {};
        }
        const batch = stories.slice(0, 30);
        await sock.sendMessage(jid, { text: `📖 Sending ${batch.length} stor${batch.length === 1 ? 'y' : 'ies'} for *@${username}*...`, edit: progress.key });
        let sent = 0;
        for (const item of batch) {
          if (signal.aborted) throw signal.reason;
          try {
            const buffer = await downloadBuffer(item.url, cfg.MAX_VIDEO_BYTES, 60000, 5, signal);
            const type = detectMediaType(buffer);
            const caption = `📸 *@${username}* story\n_via CELESTIA_`;
            if (type === 'video') await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: msg });
            else if (type === 'image') await sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg });
            else continue;
            sent++;
          } catch { if (signal.aborted) throw signal.reason; }
        }
        await sock.sendMessage(jid, {
          text: sent ? `✅ Sent ${sent}/${batch.length} stories.${stories.length > batch.length ? ' Limited to 30 per request.' : ''}` : '❌ The stories were found, but their media could not be downloaded. Please try again later.',
          edit: progress.key,
        });
        return {};
      }, owner);
    } catch (error) {
      const text = ['INSTAGRAM_LOGIN_REQUIRED', 'INSTAGRAM_BLOCKED', 'QUEUE_FULL'].includes(error.code)
        ? error.message : 'The Instagram story request failed or timed out. Please try again later.';
      if (progress?.key) await sock.sendMessage(jid, { text: `❌ ${text}`, edit: progress.key });
      else await reply(`❌ ${text}`);
    }
  },
};
