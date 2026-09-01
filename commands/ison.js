const https = require('https');

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Best-effort last-seen lookup: subscribes to presence updates and waits
// briefly for WhatsApp to push one. Many users disable this in their
// privacy settings, in which case this will simply time out.
function getLastSeen(sock, jid) {
  return new Promise((resolve) => {
    let done = false;

    const handler = (update) => {
      if (done) return;
      const presence = update.presences?.[jid];
      if (presence) {
        done = true;
        sock.ev.off('presence.update', handler);
        resolve(presence);
      }
    };

    sock.ev.on('presence.update', handler);
    sock.presenceSubscribe(jid).catch(() => {});

    setTimeout(() => {
      if (done) return;
      done = true;
      sock.ev.off('presence.update', handler);
      resolve(null);
    }, 4000);
  });
}

module.exports = {
  name: 'ison',
  description: 'Check if a phone number is on WhatsApp and view their info. Usage: .ison 254712345678',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const number = args[0]?.replace(/[^0-9]/g, '');

    if (!number) {
      return sock.sendMessage(jid, { text: '❌ Usage: .ison 254754574642' }, { quoted: msg });
    }

    const targetJid = `${number}@s.whatsapp.net`;

    try {
      const result = await sock.onWhatsApp(targetJid);
      const entry = result?.[0];

      if (!entry?.exists) {
        return sock.sendMessage(jid, { text: `❌ +${number} is not on WhatsApp.` }, { quoted: msg });
      }

      const realJid = entry.jid || targetJid;

      // Username (WhatsApp "push name", only available if they've messaged before / is public)
      let username = null;
      try {
        username = entry.notify || null;
      } catch {}

      // About / status
      let about = null;
      let aboutSetAt = null;
      try {
        const status = await sock.fetchStatus(realJid);
        const statusEntry = Array.isArray(status) ? status[0] : status;
        about = statusEntry?.status?.status || null;
        aboutSetAt = statusEntry?.status?.setAt || null;
      } catch {}

      // Last seen (best-effort)
      let lastSeenText = 'Not shared / unavailable';
      try {
        const presence = await getLastSeen(sock, realJid);
        if (presence?.lastKnownPresence === 'available') {
          lastSeenText = 'Online now';
        } else if (presence?.lastSeen) {
          lastSeenText = new Date(presence.lastSeen * 1000).toLocaleString();
        }
      } catch {}

      const caption = [
        `✅ *+${number} is on WhatsApp*`,
        username ? `👤 *Name:* ${username}` : null,
        `📝 *About:* ${about || 'Not available'}${aboutSetAt ? ` _(set ${new Date(aboutSetAt).toLocaleDateString()})_` : ''}`,
        `🕒 *Last seen:* ${lastSeenText}`,
      ].filter(Boolean).join('\n');

      try {
        const ppUrl = await sock.profilePictureUrl(realJid, 'image');
        const buffer = await downloadBuffer(ppUrl);
        await sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg });
      } catch {
        await sock.sendMessage(jid, { text: caption + '\n\n🖼 No profile picture available.' }, { quoted: msg });
      }
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Could not check number: ' + e.message }, { quoted: msg });
    }
  }
};
