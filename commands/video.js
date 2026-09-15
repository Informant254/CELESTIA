const axios = require('axios');
const { ytSearch, ytVideo, cleanName } = require('../utils/downloader');

let ytSearchNpm = null;
try {
  ytSearchNpm = require('yt-search');
} catch {
  ytSearchNpm = null; // API search below covers datacenter IPs
}

const STREAM_TIMEOUT_MS = 45000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = {
  name: 'video',
  aliases: ['ytv', 'ytmp4'],
  description: 'Rip YouTube videos straight to WhatsApp — no server disk used. Usage: .video <name or link>',
  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(chatId, {
        text: '🎬 Give me a video name or link.\nEg: `.video Blinding Lights`'
      }, { quoted: msg });
    }

    let statusMsg;
    try {
      statusMsg = await sock.sendMessage(chatId, {
        text: `🔥 Searching for *${query}*... Sit tight.`
      }, { quoted: msg });

      // 1. Ghost search YouTube (npm first, API fallback for datacenter IPs)
      let targetUrl, targetTitle;
      if (/(youtube\.com|youtu\.be)/i.test(query)) {
        targetUrl = query;
        targetTitle = 'YouTube Video';
      } else {
        let found = null;
        if (ytSearchNpm) {
          try {
            const r = await ytSearchNpm(query);
            if (r?.videos?.length) found = { url: r.videos[0].url, title: r.videos[0].title };
          } catch { found = null; }
        }
        if (!found) found = await ytSearch(query);
        targetUrl = found.url;
        targetTitle = found.title || 'YouTube Video';
      }
      console.log(`\n🎯 Target locked: ${targetUrl}`);

      await sock.sendMessage(chatId, {
        text: `😍 Found: *${targetTitle}*\n⏳ Ripping...`,
        edit: statusMsg.key
      });

      // 2. Resolve a direct MP4 stream URL — nothing touches our disk.
      // NOTE: this step was written for Piped nodes. The entire public Piped
      // network is down (11 instances tested, all dead), so it currently
      // resolves via the shared downloader. If a live Piped instance appears,
      // swap this line for:
      //   const piped = await axios.get(`https://<instance>/streams/${videoId}`);
      //   const stream = piped.data.videoStreams.find(s => s.format === 'MPEG_4' && s.videoOnly === false);
      const { url: streamUrl, title } = await ytVideo(targetUrl, targetTitle);
      const finalTitle = title || targetTitle;
      const fileName = cleanName(finalTitle, '.mp4');

      // 3. Pipe the remote URL straight into Baileys.
      try {
        await withTimeout(
          sock.sendMessage(chatId, {
            video: { url: streamUrl },
            mimetype: 'video/mp4',
            caption: `> *Ripped by CELESTIA TECH* ✨\n> Title: ${finalTitle}`
          }, { quoted: msg }),
          STREAM_TIMEOUT_MS,
          'Video stream send'
        );
        console.log('✅ Package delivered without touching our disk.');
        return sock.sendMessage(chatId, {
          text: `✅ Successfully downloaded *${finalTitle}*`,
          edit: statusMsg.key
        });
      } catch (streamErr) {
        console.error('[VIDEO] Stream send failed, buffered fallback:', streamErr.message);
      }

      // 4. Buffered fallback so a stubborn CDN doesn't swallow the command.
      const dlRes = await axios.get(streamUrl, { responseType: 'arraybuffer', timeout: 120000 });
      const buffer = Buffer.from(dlRes.data);
      if (!buffer.length) throw new Error('Downloaded file was empty. Try again.');
      await sock.sendMessage(chatId, {
        video: buffer,
        mimetype: 'video/mp4',
        fileName,
        caption: `> *Ripped by CELESTIA TECH* ✨\n> Title: ${finalTitle}`
      }, { quoted: msg });
      return sock.sendMessage(chatId, {
        text: `✅ Successfully downloaded *${finalTitle}*`,
        edit: statusMsg.key
      });

    } catch (error) {
      console.error('[VIDEO] Rip failed:', error.message);
      const failText = `┌─⧭⊷ ❌ *RIP FAILED*\n├◆ ${error.message}\n└─⧭⊷`;
      if (statusMsg) {
        await sock.sendMessage(chatId, { text: failText, edit: statusMsg.key });
      } else {
        await sock.sendMessage(chatId, { text: failText }, { quoted: msg });
      }
    }
  }
};
