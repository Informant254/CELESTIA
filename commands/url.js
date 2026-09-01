const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const IMGBB_KEY = process.env.IMGBB_KEY; // set this in your .env — never hardcode it in source

// ── Upload hosts, tried in order until one works ─────────────────────────

async function uploadToImgBB(buffer) {
  if (!IMGBB_KEY) throw new Error('IMGBB_KEY not set');
  const form = new FormData();
  form.append('image', buffer.toString('base64'));
  const { data } = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });
  if (!data?.success || !data?.data?.url) throw new Error(data?.error?.message || 'no url in response');
  return data.data.url;
}

async function uploadToCatbox(buffer, filename) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buffer, filename);
  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: { ...form.getHeaders(), 'User-Agent': BROWSER_UA },
    timeout: 60000,
  });
  const link = String(res.data || '').trim();
  if (!link.startsWith('http')) throw new Error(link || 'unexpected response');
  return link;
}

async function uploadTo0x0(buffer, filename) {
  const form = new FormData();
  form.append('file', buffer, filename);
  const res = await axios.post('https://0x0.st', form, {
    headers: { ...form.getHeaders(), 'User-Agent': BROWSER_UA },
    timeout: 60000,
  });
  const link = String(res.data || '').trim();
  if (!link.startsWith('http')) throw new Error(link || 'unexpected response');
  return link;
}

async function uploadToUguu(buffer, filename) {
  const form = new FormData();
  form.append('files[]', buffer, filename);
  const res = await axios.post('https://uguu.se/upload', form, {
    headers: form.getHeaders(),
    timeout: 60000,
  });
  const url = res.data?.files?.[0]?.url;
  if (!url) throw new Error('no url in response');
  return url;
}

async function uploadToTmpFiles(buffer, filename) {
  const form = new FormData();
  form.append('file', buffer, filename);
  const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
    headers: form.getHeaders(),
    timeout: 60000,
  });
  const url = res.data?.data?.url;
  if (!url) throw new Error('no url in response');
  return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

async function uploadImage(buffer, filename) {
  const failures = [];

  try {
    return await uploadToImgBB(buffer);
  } catch (e) {
    console.error('[URL] imgbb failed:', e.message);
    failures.push(`imgbb: ${e.message}`);
  }

  const hosts = [
    ['catbox', uploadToCatbox],
    ['0x0.st', uploadTo0x0],
    ['uguu', uploadToUguu],
    ['tmpfiles', uploadToTmpFiles],
  ];

  for (const [name, fn] of hosts) {
    try {
      const url = await fn(buffer, filename);
      console.log(`[URL] Succeeded via ${name}`);
      return url;
    } catch (e) {
      const reason = e.response?.status ? `HTTP ${e.response.status}` : e.message;
      console.error(`[URL] ${name} failed:`, reason);
      failures.push(`${name}: ${reason}`);
    }
  }

  throw new Error(failures.join(' | '));
}

// ── Command ────────────────────────────────────────────────────────────────

function extractQuotedImage(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (quoted?.imageMessage) {
    return {
      message: quoted,
      key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant },
    };
  }
  if (msg.message?.imageMessage) {
    return { message: msg.message, key: msg.key };
  }
  return null;
}

module.exports = {
  name: 'url',
  aliases: ['imgurl', 'uploads'],
  description: 'Upload a quoted image and get a direct link',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const target = extractQuotedImage(msg);

    if (!target) {
      return await sock.sendMessage(jid, { text: 'Quote an image with *.url*.' }, { quoted: msg });
    }

    try {
      const buffer = await downloadMediaMessage(
        { key: target.key, message: target.message },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      if (buffer.length > 10 * 1024 * 1024) {
        return await sock.sendMessage(jid, { text: 'Media is too large (max 10MB).' }, { quoted: msg });
      }

      const link = await uploadImage(buffer, 'image.jpg');
      await sock.sendMessage(jid, { text: `Media Link:-\n\n${link}` }, { quoted: msg });
    } catch (error) {
      console.error('[URL ERROR]', error.message);
      await sock.sendMessage(jid, { text: `❌ Upload failed: ${error.message}` }, { quoted: msg });
    }
  },
};

