const fs = require('fs');
const os = require('os');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { ensureFfmpegPath, runOnce } = require('../download/engines');

const queues = new Map(); // jid -> array of file paths
const merging = new Set();

module.exports = {
  name: 'merge',
  description: 'Merge queued videos. Usage: reply to video with .merge, then .merge done',
  queues,
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const sub = args[0]?.toLowerCase();

    if (sub === 'cancel') {
      const queue = queues.get(jid) || [];
      await Promise.allSettled(queue.map((p) => fs.promises.unlink(p)));
      queues.delete(jid);
      return sock.sendMessage(jid, { text: '🗑 Merge queue cleared.' }, { quoted: msg });
    }

    if (sub === 'done') {
      if (merging.has(jid)) {
        return sock.sendMessage(jid, { text: '⏳ A merge is already running in this chat.' }, { quoted: msg });
      }
      const queue = [...(queues.get(jid) || [])];
      if (queue.length < 2) {
        return sock.sendMessage(jid, { text: '❌ Add at least 2 videos first by replying to each with .merge' }, { quoted: msg });
      }
      queues.delete(jid);
      merging.add(jid);

      const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const listPath = path.join(os.tmpdir(), `merge_list_${id}.txt`);
      const outputPath = path.join(os.tmpdir(), `merge_out_${id}.mp4`);

      try {
        await sock.sendMessage(jid, { text: `🔗 Merging ${queue.length} videos...` }, { quoted: msg });
        await fs.promises.writeFile(listPath, queue.map(p => `file '${p}'`).join('\n'));
        await runOnce(await ensureFfmpegPath(), ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath], 120000);

        const buffer = await fs.promises.readFile(outputPath);
        await sock.sendMessage(jid, { video: buffer, caption: '✅ Merged video' }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(jid, { text: '❌ Merge failed: ' + e.message }, { quoted: msg });
      } finally {
        await Promise.allSettled([...queue, listPath, outputPath].map((p) => fs.promises.unlink(p)));
        merging.delete(jid);
      }
      return;
    }

    // Default: add replied video to queue
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted?.videoMessage) {
      return sock.sendMessage(jid, {
        text: '❌ Reply to a video with .merge to add it to the queue.\nWhen you have 2+ videos queued, run .merge done\nUse .merge cancel to clear the queue.'
      }, { quoted: msg });
    }

    try {
      const media = await downloadMediaMessage(
        { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
        'buffer',
        {}
      );

      const filePath = path.join(os.tmpdir(), `merge_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
      await fs.promises.writeFile(filePath, media);

      const queue = queues.get(jid) || [];
      queue.push(filePath);
      queues.set(jid, queue);

      await sock.sendMessage(jid, { text: `✅ Added to merge queue (${queue.length} video${queue.length > 1 ? 's' : ''}).\nReply to more videos, then send .merge done` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Could not add video: ' + e.message }, { quoted: msg });
    }
  }
};
