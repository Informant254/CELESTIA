/**
 * .downloader — engine diagnostics (spec §17).
 */
const engines = require('../download/engines');
const queue = require('../download/queue');
const sessions = require('../download/sessions');

module.exports = {
  name: 'downloader',
  aliases: ['dlstatus'],
  description: 'Show downloader engine status. Usage: .downloader',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const checking = await sock.sendMessage(jid, { text: '🔧 Checking engines...' }, { quoted: msg });
    try {
      const [st, q] = await Promise.all([engines.status(), Promise.resolve(queue.stats())]);
      const ok = (v) => (v ? '✓' : '✗');
      const tick = (v) => (v ? '✓' : '—');
      const ready = st.ytdlp && st.ffmpeg && st.ffprobe && st.storage;
      const L = [
        '╭─「 CELESTIA DOWNLOADER 」─╮',
        '│',
        `│ yt-dlp   : ${ok(st.ytdlp)}${st.ytdlp ? ` (${String(st.ytdlp).slice(0, 20)})` : ''}`,
        `│ FFmpeg   : ${ok(st.ffmpeg)}`,
        `│ FFprobe  : ${ok(st.ffprobe)}`,
        `│ aria2c   : ${tick(st.aria2c)}`,
        `│ Search   : ${ok(st.ytdlp)}`,
        `│ Queue    : ${q.active}/${q.max} · sessions ${sessions.count()}`,
        `│ Storage  : ${ok(st.storage)}`,
        '│',
        `│ Status   : ${ready ? 'READY' : 'DEGRADED'}`,
        '│',
        '╰──────────────────────────╯',
      ];
      if (!ready) {
        const missing = [];
        if (!st.ytdlp) missing.push('yt-dlp (auto-downloads on first use)');
        if (!st.ffmpeg) missing.push('FFmpeg (`npm install ffmpeg-static`)');
        if (!st.ffprobe) missing.push('FFprobe (`npm install ffprobe-static`)');
        if (!st.storage) missing.push('tmp storage (check disk/permissions)');
        L.push('', '⚠️ _Admin: ' + missing.join(' · ') + '_');
      }
      await sock.sendMessage(jid, { text: L.join('\n'), edit: checking.key });
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Diagnostics failed: ' + e.message, edit: checking.key });
    }
  },
};
