const https = require('https');
const http = require('http');
const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');
const { isPublicIp } = require('../utils/downloader');

async function scanSite(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported');
  }
  if (parsed.username || parsed.password) throw new Error('URLs with credentials are not supported');

  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error('Private or reserved network addresses are not allowed');
  }
  const target = addresses[0];

  return new Promise((resolve, reject) => {
    const client = parsed.protocol === 'https:' ? https : http;
    const start = Date.now();

    const req = client.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname || '/'}${parsed.search}`,
        method: 'GET',
        timeout: 10000,
        lookup: (hostname, options, callback) => callback(null, target.address, target.family),
      },
      (res) => {
        const responseTime = Date.now() - start;
        res.resume(); // drain body, we only need headers/status

        resolve({
          url: targetUrl,
          status: res.statusCode,
          statusMessage: res.statusMessage,
          server: res.headers['server'] || 'Unknown',
          contentType: res.headers['content-type'] || 'Unknown',
          poweredBy: res.headers['x-powered-by'] || 'Not disclosed',
          responseTime,
          headers: res.headers
        });
      }
    );

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

module.exports = {
  name: 'webscan',
  description: 'Scan a website and give basic details. Usage: .webscan https://google.com',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    let url = args.join(' ').trim();

    if (!url) {
      return sock.sendMessage(jid, {
        text: '❌ Enter a URL\nExample: .webscan https://google.com'
      }, { quoted: msg });
    }

    if (!/^[a-z][a-z\d+.-]*:/i.test(url)) {
      url = 'https://' + url;
    }

    await sock.sendMessage(jid, { text: '🔍 Scanning website...' }, { quoted: msg });

    try {
      const result = await scanSite(url);

      const text = `
╭──〔 🌐 WEBSITE SCAN 〕──╮
🔗 *URL:* ${result.url}
📊 *Status:* ${result.status} ${result.statusMessage}
🖥 *Server:* ${result.server}
⚙️ *Powered By:* ${result.poweredBy}
📄 *Content-Type:* ${result.contentType}
⏱ *Response Time:* ${result.responseTime}ms
╰──────────────────╯`.trim();

      await sock.sendMessage(jid, { text }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Scan failed: ' + e.message }, { quoted: msg });
    }
  },
};
