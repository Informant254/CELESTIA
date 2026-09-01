const axios = require('axios');
const { isDev } = require('../utils/isDev');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_BODY_CHARS = 3500;

async function fetchRaw(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    responseType: 'arraybuffer',
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'application/json, text/plain, text/html, */*',
    },
  });

  const contentType = res.headers['content-type'] || '';
  const buffer = Buffer.from(res.data);
  const isTextLike = contentType === '' || /json|text|xml|javascript/i.test(contentType);

  return {
    status: res.status,
    contentType,
    isTextLike,
    text: isTextLike ? buffer.toString('utf8') : null,
    size: buffer.length,
  };
}

function formatBody(result) {
  if (!result.isTextLike) {
    return `_(binary response, ${result.contentType || 'unknown type'}, ${result.size} bytes — not shown)_`;
  }

  const trimmed = result.text.trim();
  if (!trimmed) return '_(empty response body)_';

  // Pretty-print JSON like a real API console/other-bot output would.
  try {
    const parsed = JSON.parse(trimmed);
    const pretty = JSON.stringify(parsed, null, 2);
    const truncated = pretty.length > MAX_BODY_CHARS;
    return `\`\`\`json\n${pretty.slice(0, MAX_BODY_CHARS)}${truncated ? '\n... (truncated)' : ''}\n\`\`\``;
  } catch {
    // Not JSON (HTML page, plain text, etc.) — show as monospaced text.
    const truncated = trimmed.length > MAX_BODY_CHARS;
    return `\`\`\`\n${trimmed.slice(0, MAX_BODY_CHARS)}${truncated ? '\n... (truncated)' : ''}\n\`\`\``;
  }
}

module.exports = {
  name: 'fetch',
  aliases: ['curl'],
  description: 'Fetches content from a URL (developer only). Usage: .fetch <url>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!isDev(msg, sock)) {
      return sock.sendMessage(jid, { text: '❌ This command is restricted to ᴾᴬᴾᴾᴵ ᴵˢᴬᴬᶜ only.' }, { quoted: msg });
    }

    const url = args[0];
    if (!url) {
      return sock.sendMessage(jid, { text: '❌ Usage: .fetch <url>' }, { quoted: msg });
    }

    try {
      const result = await fetchRaw(url);
      const body = formatBody(result);
      await sock.sendMessage(jid, { text: `📡 *Status:* ${result.status}\n\n${body}` }, { quoted: msg });
    } catch (error) {
      console.error('[FETCH ERROR]', error.code, error.response?.status, error.message);
      const reason = error.code === 'ECONNABORTED'
        ? 'request timed out.'
        : error.response?.status
          ? `server returned ${error.response.status}.`
          : error.message;
      await sock.sendMessage(jid, { text: `❌ ${reason}` }, { quoted: msg });
    }
  },
};

