/**
 * utils/greeter.js — group join/leave/promote announcements.
 *
 * Extracted from index.js so the flow is unit-testable. Rules:
 * - PDM (promote/demote) announcements fire on their own per-group flag.
 * - Welcome/goodbye fire on per-group flags. The global `welcomegoodbye`
 *   master is a kill switch ONLY when explicitly set to false — a group
 *   that turned `.welcome on` must not stay silent because the master was
 *   never touched (that was the "welcome not working" bug).
 */
const settingsStore = require('./settingsStore');
const groupSettingsStore = require('./groupSettingsStore');

function participantJid(entry) {
  const jid = entry && typeof entry === 'object' ? (entry.phoneNumber || entry.id) : entry;
  return String(jid || '');
}

function short(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

async function handleParticipantsUpdate(sock, event) {
  if (!event?.id) return { handled: false };
  const metadata = await sock.groupMetadata(event.id);
  try {
    require('./groupCache').groupCache.set(event.id, metadata);
  } catch { /* cache never breaks greetings */ }

  const perGroup = groupSettingsStore.getAll(event.id);
  const list = Array.isArray(event.participants) ? event.participants : [];

  if (perGroup.pdm && (event.action === 'promote' || event.action === 'demote')) {
    const authorJid = event.author || '';
    const authorTag = authorJid ? `@${short(authorJid)}` : 'an Admin';
    for (const entry of list) {
      const pid = participantJid(entry);
      const participantTag = `@${short(pid)}`;
      const mentions = [pid];
      if (authorJid) mentions.push(authorJid);
      if (event.action === 'promote') {
        await sock.sendMessage(event.id, {
          text: `*👑 ${authorTag} has crowned ${participantTag}.*`,
          mentions,
        });
      } else {
        await sock.sendMessage(event.id, {
          text: `*📉 ${authorTag} has demoted ${participantTag}.*`,
          mentions,
        });
      }
    }
    return { handled: true };
  }

  // Global master kills greetings only when explicitly OFF. Absent/true
  // means per-group flags decide — `.welcome on` works out of the box.
  const masterOff = settingsStore.get('welcomegoodbye', undefined) === false;
  if (!masterOff) {
    for (const entry of list) {
      const participant = participantJid(entry);
      if (event.action === 'add' && perGroup.welcome) {
        await sock.sendMessage(event.id, {
          text: `👋 Welcome @${short(participant)} to *${metadata.subject}*! Glad to have you here.`,
          mentions: [participant],
        });
      } else if (event.action === 'remove' && perGroup.goodbye) {
        await sock.sendMessage(event.id, {
          text: `👋 @${short(participant)} has left *${metadata.subject}*. Goodbye!`,
          mentions: [participant],
        });
      }
    }
  }

  if (perGroup.setgreet && event.action === 'add') {
    for (const entry of list) {
      const participant = participantJid(entry);
      await sock.sendMessage(event.id, {
        text: `*Hi @${short(participant)}, this is ✨ CELESTIA - The Most Beautiful Bot ✨, glad to have you here*\n> 🌸 Heavenly elegance`,
        mentions: [participant],
      });
    }
  }
  return { handled: true };
}

module.exports = { handleParticipantsUpdate };
