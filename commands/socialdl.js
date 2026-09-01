const https = require('https');
const axios = require('axios');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ error: raw }); }
      });
    }).on('error', reject);
  });
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = [

  // ── TIKTOK 
  {
    name: 'tiktok',
    aliases: ['tt'],
    description: 'Download TikTok video. Usage: .tiktok <url>',
    async execute(sock, msg, args) {
      const jid = msg.key.remoteJid;
      const url = args[0];

      if (!url || !url.includes('tiktok.com')) {
        return sock.sendMessage(jid, { text: '❌ Usage: .tiktok <TikTok URL>' }, { quoted: msg });
      }

      await sock.sendMessage(jid, { text: '⏳ Downloading TikTok video...' }, { quoted: msg });

      try {
        const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
        const res = await httpsGet(api);

        if (!res?.data?.play) throw new Error('Could not fetch video');

        const videoBuffer = await downloadBuffer(res.data.play);

        await sock.sendMessage(jid, {
          video: videoBuffer,
          caption: `🎵 *${res.data.title || 'TikTok Video'}*\n👤 ${res.data.author?.nickname || ''}`
        }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(jid, { text: '❌ TikTok download failed: ' + e.message }, { quoted: msg });
      }
    }
  },

  // ── INSTAGRAM 
  {
    name: 'ig',
    aliases: ['insta', 'instagram'],
    description: 'Download Instagram post/reel. Usage: .ig <url>',
    async execute(sock, msg, args) {
      const jid = msg.key.remoteJid;
      const url = args[0];

      if (!url || !url.includes('instagram.com')) {
        return sock.sendMessage(jid, { text: '❌ Usage: .ig <Instagram URL>' }, { quoted: msg });
      }

      await sock.sendMessage(jid, { text: '⏳ Downloading Instagram media...' }, { quoted: msg });

      try {
        const response = await fetch(`https://api.bk9.dev/download/instagram?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (!data.status || !data.BK9 || typeof data.BK9 === 'string') {
          throw new Error('Could not fetch media. Make sure the post is public.');
        }

        const items = Array.isArray(data.BK9) ? data.BK9 : [data.BK9];

        for (const item of items) {
          const itemUrl = item?.url || item?.video || item?.image || (typeof item === 'string' ? item : null);
          if (!itemUrl) continue;

          const buffer = await downloadBuffer(itemUrl);
          const isVideo = item?.type === 'video' || itemUrl.includes('.mp4');

          await sock.sendMessage(jid, isVideo
            ? { video: buffer, caption: '📸 Instagram' }
            : { image: buffer, caption: '📸 Instagram' }
          , { quoted: msg });
        }
      } catch (e) {
        await sock.sendMessage(jid, { text: '❌ Instagram download failed: ' + e.message }, { quoted: msg });
      }
    }
  },

  // ── FACEBOOK 
  {
    name: 'fb',
    aliases: ['facebook'],
    description: 'Download Facebook video. Usage: .fb <url>',
    async execute(sock, msg, args) {
      const jid = msg.key.remoteJid;
      const url = args[0];

      if (!url || (!url.includes('facebook.com') && !url.includes('fb.watch'))) {
        return sock.sendMessage(jid, { text: '❌ Usage: .fb <Facebook URL>' }, { quoted: msg });
      }

      await sock.sendMessage(jid, { text: '⏳ Downloading Facebook video...' }, { quoted: msg });

      try {
        const response = await fetch(`https://api.bk9.dev/download/fb?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (!data.status || !data.BK9) {
          throw new Error('Could not fetch video. Make sure the link is valid and public.');
        }

        const videoUrl = data.BK9?.hd || data.BK9?.sd || data.BK9?.url || (typeof data.BK9 === 'string' ? data.BK9 : null);
        if (!videoUrl) throw new Error('No downloadable video found for that link.');

        const buffer = await downloadBuffer(videoUrl);

        await sock.sendMessage(jid, {
          video: buffer,
          caption: `📘 *${data.BK9?.title || 'Facebook Video'}*`
        }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(jid, { text: '❌ Facebook download failed: ' + e.message }, { quoted: msg });
      }
    }
  },

  // ── TWITTER  
  {
    name: 'twitter',
    aliases: ['x', 'tw'],
    description: 'Download Twitter/X video or image. Usage: .twitter <url>',
    async execute(sock, msg, args) {
      const jid = msg.key.remoteJid;
      const url = args[0];

      if (!url || !/https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+\/status\/\d+/.test(url)) {
        return sock.sendMessage(jid, { text: '❌ Usage: .twitter <Twitter/X post URL>' }, { quoted: msg });
      }

      await sock.sendMessage(jid, { text: '⏳ Downloading Twitter/X media...' }, { quoted: msg });

      try {
        const tweetId = url.match(/\/status\/(\d+)/)?.[1];
        if (!tweetId) throw new Error('Could not parse tweet ID from that link.');

        const res = await axios.get(`https://api.fxtwitter.com/i/status/${tweetId}`, {
          timeout: 30000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const tweet = res.data?.tweet;
        if (!tweet) throw new Error('Tweet not found or is from a private account.');

        const caption = `🐦 *@${tweet.author?.screen_name || 'Unknown'}*\n\n${tweet.text || ''}`;
        const media = tweet.media;

        if (media?.videos?.length) {
          const video = media.videos[0];
          const buffer = await downloadBuffer(video.url);
          await sock.sendMessage(jid, {
            video: buffer,
            caption,
            gifPlayback: video.type === 'gif'
          }, { quoted: msg });
        } else if (media?.photos?.length) {
          for (const photo of media.photos) {
            const buffer = await downloadBuffer(photo.url);
            await sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg });
          }
        } else {
          await sock.sendMessage(jid, { text: `🐦 *Tweet (no media)*\n\n${caption}` }, { quoted: msg });
        }
      } catch (e) {
        const errMsg = e?.response?.data?.message || e.message || 'Unknown error';
        await sock.sendMessage(jid, { text: '❌ Twitter download failed: ' + errMsg }, { quoted: msg });
      }
    }
  },

];
