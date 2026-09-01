const https = require('https');
const { KEITH_BASE } = require('../config/apis');

function httpsGetJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function fetchSpeech(topic) {
  const url = `${KEITH_BASE}/ai/speechwriter?topic=${encodeURIComponent(topic)}&length=short&type=dedication&tone=serious`;
  const json = await httpsGetJSON(url);
  const result = json.result;

  if (result && typeof result === 'object') {
    throw new Error(result.error || result.message || 'upstream speechwriter service returned a failure.');
  }

  if (!json.status || typeof result !== 'string' || !result.trim()) {
    throw new Error(json.error || 'API returned no usable result.');
  }

  return result;
}

module.exports = {
  name: 'speechwriter',
  aliases: ['speech', 'writer'],
  description: 'Generate a custom speech on any topic',

  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : rawJid;

    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(
        jid,
        { text: '❌ Provide a topic, e.g. `.speechwriter how to pass exams`' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(jid, { text: '✍️ *Drafting your speech...*' }, { quoted: msg });

    let speech = null;

    try {
      speech = await fetchSpeech(query);
    } catch (e) {
      console.error('[SPEECHWRITER] Primary endpoint failed:', e.message);
    }

    if (!speech) {
      try {
        const prompt = `Write a powerful, well-crafted, serious speech on the following topic: "${query}". Keep it well-formatted with clear paragraphs.`;
        const json = await httpsGetJSON(`${KEITH_BASE}/ai/gpt4?q=${encodeURIComponent(prompt)}`);
        if (json.status && typeof json.result === 'string' && json.result.trim()) {
          speech = json.result;
        } else {
          console.error('[SPEECHWRITER] Fallback returned no usable result. Raw:', JSON.stringify(json).slice(0, 500));
        }
      } catch (err) {
        console.error('[SPEECHWRITER] Fallback request failed:', err.message);
      }
    }

    if (!speech) {
      return await sock.sendMessage(
        jid,
        { text: '❌ *Failed to generate speech. Please try again later.*', edit: thinkingMsg.key },
        { quoted: msg }
      );
    }

    await sock.sendMessage(
      jid,
      { text: `🎙️ *Generated Speech*\n\n${speech.trim()}`, edit: thinkingMsg.key },
      { quoted: msg }
    );
  },
};

