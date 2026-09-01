const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const ffmpegPath = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const execFileAsync = promisify(execFile);

const { KEITH_BASE } = require('../config/apis');
const API = KEITH_BASE;

const ACR_HOST = process.env.ACR_HOST || 'identify-eu-west-1.acrcloud.com';
const ACR_ACCESS_KEY = process.env.ACR_ACCESS_KEY || '678eed85d47920b4737382eff9adfe46';
const ACR_ACCESS_SECRET = process.env.ACR_ACCESS_SECRET || 'l70euTw5vrswSmnKk4T0EglrtPfpUhSzVi04Evea';
function extractMediaTarget(msg) {
  const m = msg.message;
  if (m?.audioMessage) return { type: 'audio', message: m, key: msg.key };
  if (m?.videoMessage) return { type: 'video', message: m, key: msg.key };

  const ctx = m?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;

  if (quoted?.audioMessage) {
    return {
      type: 'audio',
      message: quoted,
      key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant },
    };
  }
  if (quoted?.videoMessage) {
    return {
      type: 'video',
      message: quoted,
      key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant },
    };
  }
  return null;
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function identifyWithACRCloud(audioFilePath) {
  if (!ACR_HOST || !ACR_ACCESS_KEY || !ACR_ACCESS_SECRET) {
    throw new Error('ACRCloud credentials are not configured (ACR_HOST / ACR_ACCESS_KEY / ACR_ACCESS_SECRET).');
  }

  const httpMethod = 'POST';
  const httpUri = '/v1/identify';
  const dataType = 'audio';
  const signatureVersion = '1';
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const stringToSign = [httpMethod, httpUri, ACR_ACCESS_KEY, dataType, signatureVersion, timestamp].join('\n');
  const signature = crypto
    .createHmac('sha1', ACR_ACCESS_SECRET)
    .update(Buffer.from(stringToSign, 'utf-8'))
    .digest('base64');

  const sample = fs.readFileSync(audioFilePath);

  const FormData = require('form-data');
  const form = new FormData();
  form.append('sample', sample, { filename: 'sample', contentType: 'application/octet-stream' });
  form.append('sample_bytes', sample.length);
  form.append('access_key', ACR_ACCESS_KEY);
  form.append('data_type', dataType);
  form.append('signature_version', signatureVersion);
  form.append('signature', signature);
  form.append('timestamp', timestamp);

  const response = await axios.post(`https://${ACR_HOST}${httpUri}`, form, {
    headers: form.getHeaders(),
  });

  return response.data;
}

module.exports = {
  name: 'shazam',
  description: 'Identifies a song from audio/video and downloads the full track.',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const target = extractMediaTarget(msg);

    if (!target) {
      return await sock.sendMessage(
        jid,
        { text: '🎧 Reply to a voice note, audio file, or short video with *.shazam*.' },
        { quoted: msg }
      );
    }

    await sock.sendMessage(jid, { react: { text: '🔎', key: msg.key } });

    let tmpInput;
    let tmpAudio;

    try {
      const { downloadMediaMessage } = require('@whiskeysockets/baileys');
      const targetMsg = { key: target.key, message: target.message };

      const buffer = await downloadMediaMessage(
        targetMsg,
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      const tmpDir = os.tmpdir();
      const ext = target.type === 'video' ? 'mp4' : 'ogg';
      tmpInput = path.join(tmpDir, `shazam_in_${Date.now()}.${ext}`);
      tmpAudio = path.join(tmpDir, `shazam_out_${Date.now()}.mp3`);

      fs.writeFileSync(tmpInput, buffer);

      await execFileAsync(ffmpegPath, [
        '-y', '-i', tmpInput, '-t', '20', '-vn', '-ac', '1', '-ar', '44100', '-f', 'mp3', tmpAudio,
      ]);

      const acrData = await identifyWithACRCloud(tmpAudio);

      if (acrData?.status?.code !== 0 || !acrData?.metadata?.music?.length) {
        return await sock.sendMessage(
          jid,
          { text: "😕 Couldn't identify that track. Try a clearer clip." },
          { quoted: msg }
        );
      }

      const track = acrData.metadata.music[0];
      const title = track.title;
      const artist = track.artists?.map(a => a.name).join(', ') || 'Unknown';
      const album = track.album?.name;
      const releaseDate = track.release_date;
      const spotifyUrl = track.external_metadata?.spotify?.track?.id
        ? `https://open.spotify.com/track/${track.external_metadata.spotify.track.id}`
        : null;
      const appleUrl = track.external_metadata?.apple_music?.url || null;
      const albumArt = track.external_metadata?.spotify?.album?.images?.[0]?.url || null;

      const caption = [
        `🎵 *${title}*`,
        `👤 *Artist:* ${artist}`,
        album ? `💿 *Album:* ${album}` : null,
        releaseDate ? `📅 *Released:* ${releaseDate}` : null,
        spotifyUrl ? `🟢 *Spotify:* ${spotifyUrl}` : null,
        appleUrl ? `🍎 *Apple Music:* ${appleUrl}` : null,
      ].filter(Boolean).join('\n');

      if (albumArt) {
        const img = await downloadBuffer(albumArt);
        await sock.sendMessage(jid, { image: img, caption }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { text: caption }, { quoted: msg });
      }

      const query = `${title} ${artist}`;

      await sock.sendMessage(jid, { text: `🎧 Downloading *${query}*...` }, { quoted: msg });

      const search = await axios.get(`${API}/search/yts?query=${encodeURIComponent(query)}`);
      const videos = search.data?.result;

      if (!Array.isArray(videos) || videos.length === 0) {
        throw new Error('Could not find the song on YouTube.');
      }

      const videoUrl = videos[0].url;
      const download = await axios.get(`${API}/download/audio?url=${encodeURIComponent(videoUrl)}`);
      const audioUrl = download.data?.result;

      if (!audioUrl) {
        throw new Error('Failed to download audio.');
      }

      await sock.sendMessage(
        jid,
        { audio: { url: audioUrl }, mimetype: 'audio/mpeg', fileName: `${title}.mp3`, ptt: false },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[SHAZAM ERROR]', error);
      await sock.sendMessage(jid, { text: `⚠️ ${error.message}` }, { quoted: msg });
    } finally {
      [tmpInput, tmpAudio].forEach((f) => {
        if (f && fs.existsSync(f)) {
          try { fs.unlinkSync(f); } catch {}
        }
      });
    }
  },
};
