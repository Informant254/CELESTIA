const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

module.exports = {
  name: 'add',
  description: 'Adds a participant to the group by number, or by replying to their message (admin only).',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ *This command only works in groups.*' }, { quoted: msg });
      return;
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const repliedLid = ctx?.participant;
    const repliedPn = ctx?.participantAlt || ctx?.participantPn;
    const number = (args[0] || '').replace(/[^0-9]/g, '');

    let targetJid;
    let targetLid; // kept alongside, so membership check can match either form
    if (repliedPn) {
      targetJid = repliedPn;
      targetLid = repliedLid;
    } else if (repliedLid) {
      targetJid = repliedLid;
      targetLid = repliedLid;
    } else if (number) {
      targetJid = `${number}@s.whatsapp.net`;
    } else {
      await sock.sendMessage(
        jid,
        { text: '❌ *Who should I add, provide a number or reply to their mesage*' },
        { quoted: msg }
      );
      return;
    }

    const metadata = await sock.groupMetadata(jid);
    const senderJid = msg.key.participant || msg.key.remoteJid;

    if (!isSenderAdmin(metadata, senderJid)) {
      await sock.sendMessage(jid, { text: '❌ *Only group admins can use this command.*' }, { quoted: msg });
      return;
    }
    if (!isBotAdmin(sock, metadata)) {
      await sock.sendMessage(jid, { text: '❌ *I need to be a group admin to add members.*' }, { quoted: msg });
      return;
    }

    const alreadyMember = metadata.participants.some(
      (p) => p.id === targetJid || (targetLid && p.id === targetLid) || p.phoneNumber === targetJid
    );
    if (alreadyMember) {
      await sock.sendMessage(
        jid,
        { text: `ℹ️ *@${targetJid.split('@')[0]} is already a member.*`, mentions: [targetJid] },
        { quoted: msg }
      );
      return;
    }

    try {
      const result = await sock.groupParticipantsUpdate(jid, [targetJid], 'add');

      const participantResult = result?.[0];
      if (participantResult?.status === '409') {
        await sock.sendMessage(
          jid,
          { text: `ℹ️ *@${targetJid.split('@')[0]} is already a member.*`, mentions: [targetJid] },
          { quoted: msg }
        );
        return;
      }

      if (participantResult && participantResult.status !== '200') {
        await sendInviteFallback(sock, jid, targetJid, metadata, msg);
        return;
      }

      await sock.sendMessage(
        jid,
        { text: `✅ *Added @${targetJid.split('@')[0]} to the group.*`, mentions: [targetJid] },
        { quoted: msg }
      );
    } catch (error) {
      try {
        await sendInviteFallback(sock, jid, targetJid, metadata, msg);
      } catch (fallbackError) {
        await sock.sendMessage(jid, { text: `❌ *Failed to add member: ${error.message}*` }, { quoted: msg });
      }
    }
  },
};

async function sendInviteFallback(sock, groupJid, targetJid, metadata, msg) {
  try {
    const inviteCode = await sock.groupInviteCode(groupJid);
    const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;

    let image;

    try {
      const ppUrl = await sock.profilePictureUrl(groupJid, 'image');
      const https = require('https');

      image = await new Promise((resolve, reject) => {
        https.get(ppUrl, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }).on('error', reject);
      });
    } catch {
      image = null;
    }

    const caption = `╭━━━〔 📨 GROUP INVITATION 〕━━━╮

🏷️ *Group:* ${metadata.subject}

👥 *Members:* ${metadata.participants.length}

🤖 *Sent by:* CELESTIA

━━━━━━━━━━━━━━━━━━

You couldn't be added directly because of your WhatsApp privacy settings.

Tap the link below to join the group:

🔗 ${inviteLink}

━━━━━━━━━━━━━━━━━━

Hope to see you there! 🎉`;

    if (image) {
      await sock.sendMessage(targetJid, {
        image,
        caption
      });
    } else {
      await sock.sendMessage(targetJid, {
        text: caption
      });
    }

    await sock.sendMessage(
      groupJid,
      {
        text: `📨 *Couldn't add @${targetJid.split('@')[0]} directly, so I've sent them a private invitation.*`,
        mentions: [targetJid]
      },
      { quoted: msg }
    );

  } catch (e) {
    await sock.sendMessage(
      groupJid,
      {
        text: `❌ *Couldn't add @${targetJid.split('@')[0]} directly, and couldn't send an invite either:*\n${e.message}`,
        mentions: [targetJid]
      },
      { quoted: msg }
    );
  }
}
