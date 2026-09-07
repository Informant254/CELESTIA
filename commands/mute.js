const { parseDuration, formatDuration, scheduleUnmute } = require('../utils/muteTimers');

module.exports = {
  name: 'mute',
  description: 'Mutes the group (admins-only messaging). Timed: .mute 30m / .mute 2h / .mute 1d — auto-unmutes. ".mute off" to unmute now.',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
      return;
    }

    const metadata = await sock.groupMetadata(jid);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

    if (!isSenderAdmin(metadata, senderJid)) {
      await sock.sendMessage(jid, { text: '❌ Only group admins can use this command.' }, { quoted: msg });
      return;
    }
    if (!isBotAdmin(sock, metadata)) {
      await sock.sendMessage(jid, { text: '❌ I need to be a group admin to change group settings.' }, { quoted: msg });
      return;
    }

    const first = (args[0] || '').toLowerCase();

    // .mute off / .mute unmute — lift immediately
    if (first === 'off' || first === 'unmute') {
      await sock.groupSettingUpdate(jid, 'not_announcement');
      await sock.sendMessage(jid, { text: '🔓 Group unmuted — everyone can send messages again.' }, { quoted: msg });
      return;
    }

    // .mute status — show remaining time
    if (first === 'status') {
      const fs = require('fs');
      const path = require('path');
      const timers = (() => {
        try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'muteTimers.json'), 'utf8')); } catch { return {}; }
      })();
      const at = timers[jid];
      if (at && at > Date.now()) {
        await sock.sendMessage(jid, { text: `⏳ Muted — auto-unmute in *${formatDuration(at - Date.now())}*. Use *.mute off* to unmute now.` }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { text: 'ℹ️ No active mute timer for this group.' }, { quoted: msg });
      }
      return;
    }

    // .mute <duration> — timed mute with auto-unmute
    const ms = parseDuration(args.join(''));
    if (ms) {
      await sock.groupSettingUpdate(jid, 'announcement');
      scheduleUnmute(sock, jid, ms);
      const human = formatDuration(ms);
      await sock.sendMessage(jid, { text: `🔒 Group muted for *${human}* — only admins can send messages.\n⏰ Auto-unmute scheduled. *.mute status* to check, *.mute off* to end early.` }, { quoted: msg });
      return;
    }

    // .mute — permanent (no timer)
    if (!first) {
      await sock.groupSettingUpdate(jid, 'announcement');
      await sock.sendMessage(jid, { text: '🔒 Group muted — only admins can send messages now.\nTip: *.mute 30m* / *.mute 2h* to auto-unmute later.' }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, { text: '❓ Unknown option. Try: *.mute* (forever), *.mute 30m / 2h / 1d* (timed), *.mute status*, *.mute off*.' }, { quoted: msg });
  },
};
