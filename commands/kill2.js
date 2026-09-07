const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');
const { isBotAdmin, getBotIdentifiers } = require('../utils/isAdmin');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

const pending = new Map(); // key: senderNorm:groupId -> {link, ts, groupName, memberCount}
const cooldown = new Map();
const PENDING_TTL = 60 * 1000;
const COOLDOWN_TTL = 60 * 60 * 1000;
const BATCH_SIZE = 15;
const MENTION_CHUNK = 30;

function normalize(jid) {
  if (!jid) return '';
  const at = jid.indexOf('@');
  const idPart = at === -1 ? jid : jid.slice(0, at).split(':')[0];
  const domain = at === -1 ? '' : jid.slice(at);
  return idPart + domain;
}

// Owner gate — shared LID-aware util (matches your number AND your LID).
function isStrictOwner(msg) {
  return isOwner(msg);
}

function extractInviteCode(link) {
  if (!link) return null;
  let trimmed = String(link).trim().replace(/^<|>$/g, '').replace(/^\s+|\s+$/g, '');
  // Try URL parsing for robust handling (strips query/hash, handles invite/ path)
  try {
    if (trimmed.includes('chat.whatsapp.com')) {
      let urlStr = trimmed;
      if (!urlStr.match(/^https?:\/\//i)) urlStr = 'https://' + urlStr.replace(/^\/\//, '');
      const url = new URL(urlStr);
      const parts = url.pathname.split('/').filter(Boolean);
      // supports /AAAA and /invite/AAAA
      let code = parts[parts.length - 1];
      if (code) {
        code = code.split('?')[0].split('#')[0].split('&')[0].trim();
        if (/^[A-Za-z0-9_-]{15,35}$/.test(code)) return code;
        if (code.length >= 10 && code.length <= 40 && /^[A-Za-z0-9_-]+$/.test(code)) return code;
        // return even if not strict, let groupGetInviteInfo validate
        if (code.length >= 10) return code;
      }
    }
  } catch {}
  // Fallback regex: allow _ and - and various lengths, captures code
  const m = trimmed.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{15,35})/i);
  if (m) return m[1];
  // Just code alone (with possible query)
  const direct = trimmed.split('?')[0].split('#')[0].split('/').pop().trim();
  if (/^[A-Za-z0-9_-]{15,35}$/.test(direct)) return direct;
  if (/^[A-Za-z0-9_-]{10,40}$/.test(trimmed)) return trimmed.trim();
  // Last resort: original split behavior (preserves compatibility with CELESTIA)
  if (trimmed.includes('chat.whatsapp.com/')) {
    const parts = trimmed.split('chat.whatsapp.com/');
    if (parts[1]) {
      const code = parts[1].split('?')[0].split('/')[0].trim().split(' ')[0];
      if (code.length >= 10) return code;
    }
  }
  return null;
}

module.exports = {
  name: 'kill2',
  aliases: ['kickall2', 'kick-all2'],
  description: 'Hardened: Nuclear kick remote group by invite link (Owner only, 2-step confirm, batched, pre-check).',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderNorm = normalize(senderJid);

    if (!isStrictOwner(msg)) {
      return sock.sendMessage(jid, { text: '*Command meant for the owner (strict)*' }, { quoted: msg });
    }

    const rawLink = args[0];
    if (!rawLink) {
      return sock.sendMessage(jid, { text: 'Provide a valid group link. Usage: .kill2 <https://chat.whatsapp.com/XXXX>  then .kill2 <link> confirm' }, { quoted: msg });
    }

    const inviteCode = extractInviteCode(rawLink);
    if (!inviteCode) {
      return sock.sendMessage(jid, { text: '❌ Invalid invite link. Expected: https://chat.whatsapp.com/XXXXXXXXXXXXXXXXXXXX (20-30 chars).' }, { quoted: msg });
    }

    let groupInfo;
    try {
      groupInfo = await sock.groupGetInviteInfo(inviteCode);
    } catch (e) {
      return sock.sendMessage(jid, { text: `❌ Could not fetch invite: ${e.message}. Check link or bot not invited.` }, { quoted: msg });
    }

    const groupId = groupInfo.id;
    const groupName = groupInfo.subject || 'Unknown';

    // Cooldown check per remote group
    const cd = cooldown.get(groupId);
    if (cd && Date.now() - cd < COOLDOWN_TTL) {
      const left = Math.ceil((COOLDOWN_TTL - (Date.now() - cd)) / 60000);
      return sock.sendMessage(jid, { text: `⏳ Cooldown for ${groupName} active. Try again in ${left}m.` }, { quoted: msg });
    }

    let groupMetadata;
    try {
      groupMetadata = await sock.groupMetadata(groupId);
    } catch (e) {
      return sock.sendMessage(jid, { text: `❌ Bot is not in that group or cannot fetch metadata: ${e.message}. Ensure bot is in group and is admin.` }, { quoted: msg });
    }

    if (!isBotAdmin(sock, groupMetadata)) {
      return sock.sendMessage(jid, { text: `❌ I need to be admin in "${groupName}" to kill. Currently not admin.` }, { quoted: msg });
    }

    const memberCount = groupMetadata.participants.length;
    const pendingKey = `${senderNorm}:${groupId}`;

    if (args[1] !== 'confirm') {
      pending.set(pendingKey, { inviteCode, rawLink, ts: Date.now(), groupName, memberCount, groupId });
      setTimeout(() => pending.delete(pendingKey), PENDING_TTL).unref?.();
      return sock.sendMessage(jid, {
        text:
          `⚠️ *REMOTE KILL PREVIEW - HARDENED* ⚠️\n\n` +
          `Group: *${groupName}*\n` +
          `ID: ${groupId}\n` +
          `Members: ${memberCount}\n` +
          `Bot admin: ✅ yes\n` +
          `Extracted code: ${inviteCode}\n` +
          `Original link: ${rawLink}\n\n` +
          `This will:\n` +
          `1. Kick all members (batched ${BATCH_SIZE}, audit logged)\n` +
          `2. Lock to announcement, remove icon, rename, revoke invite, leave\n\n` +
          `To confirm within 60s, type (any format of same link works):\n` +
          `.kill2 ${rawLink} confirm`
      }, { quoted: msg });
    }

    const pend = pending.get(pendingKey);
    if (!pend || Date.now() - pend.ts > PENDING_TTL || pend.inviteCode !== inviteCode) {
      pending.delete(pendingKey);
      const reason = !pend ? 'No pending' : (Date.now() - pend.ts > PENDING_TTL ? 'Expired (60s)' : `Code mismatch (expected ${pend.inviteCode}, got ${inviteCode})`);
      return sock.sendMessage(jid, { text: `❌ No pending confirmation (${reason}). Run \`.kill2 <link>\` first, then \`.kill2 <link> confirm\` within 60s. Use same invite code (any URL format ok).` }, { quoted: msg });
    }
    pending.delete(pendingKey);

    // Audit log
    try {
      const logDir = path.join(__dirname, '..', 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, `kill2-${groupId.replace(/[^0-9]/g,'')}-${Date.now()}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        executor: senderJid,
        groupId,
        groupName,
        memberCount,
        participants: groupMetadata.participants.map(p=>p.id),
        timestamp: new Date().toISOString()
      }, null, 2));
    } catch {}

    await sock.sendMessage(jid, { text: `☠️ Hardened kill2: Preparing to kill "${groupName}" (${memberCount} members)...` }, { quoted: msg });

    // Build participant list excluding bot
    const botIds = getBotIdentifiers(sock);
    const botNorm = new Set([...botIds].map(normalize));
    // Also add jidNormalizedUser variant
    try { botNorm.add(normalize(jidNormalizedUser(sock.user.id))); } catch {}

    const participants = groupMetadata.participants
      .map(p => p.id)
      .filter(id => !botNorm.has(normalize(id)));

    if (participants.length === 0) {
      return sock.sendMessage(jid, { text: 'ℹ️ No other members to remove.' }, { quoted: msg });
    }

    // Step 1: Kick all in batches (do this FIRST, before vandalizing, so half-fail leaves group still recoverable)
    let removed = 0;
    let failed = 0;
    const failedIds = [];

    // Notify remote group in chunks (mention limit)
    for (let i = 0; i < participants.length; i += MENTION_CHUNK) {
      const chunk = participants.slice(i, i + MENTION_CHUNK);
      try {
        await sock.sendMessage(groupId, {
          text: `⚠️ My owner has initiated a hardened remote kill. This group will be archived. Participants in this chunk: ${chunk.length}`,
          mentions: chunk
        });
      } catch {}
      await new Promise(r => setTimeout(r, 800));
    }

    for (let i = 0; i < participants.length; i += BATCH_SIZE) {
      const batch = participants.slice(i, i + BATCH_SIZE);
      try {
        await sock.groupParticipantsUpdate(groupId, batch, 'remove');
        removed += batch.length;
      } catch (e) {
        for (const single of batch) {
          try {
            await sock.groupParticipantsUpdate(groupId, [single], 'remove');
            removed++;
            await new Promise(r => setTimeout(r, 700 + Math.random()*600));
          } catch {
            failed++;
            failedIds.push(single.split('@')[0]);
          }
        }
      }
      if (i + BATCH_SIZE < participants.length) await new Promise(r => setTimeout(r, 1500 + Math.random()*1500));
    }

    // Step 2: Vandalize / lock (only after kick, and each guarded)
    const vandalizeResults = [];
    try { await sock.groupSettingUpdate(groupId, 'announcement'); vandalizeResults.push('locked'); } catch(e){ vandalizeResults.push('lock failed:'+e.message.slice(0,40)) }
    try { await sock.removeProfilePicture(groupId); vandalizeResults.push('icon removed'); } catch(e){ vandalizeResults.push('icon fail') }
    try { await sock.groupUpdateSubject(groupId, 'This group is no longer available 🚫'); vandalizeResults.push('renamed'); } catch(e){ vandalizeResults.push('rename fail') }
    try { await sock.groupUpdateDescription(groupId, 'Removed by hardened kill2 - audit logged.'); vandalizeResults.push('desc updated'); } catch(e){ vandalizeResults.push('desc fail') }
    try { await sock.groupRevokeInvite(groupId); vandalizeResults.push('invite revoked'); } catch(e){ vandalizeResults.push('revoke fail') }

    try { await sock.sendMessage(groupId, { text: `Hardened kill done. Removed ${removed}, failed ${failed}. Group will be left.` }); } catch {}
    try { await sock.groupLeave(groupId); } catch {}

    cooldown.set(groupId, Date.now());

    let result = `✅ Hardened kill2 done for "${groupName}".\nRemoved: ${removed}\nFailed: ${failed}`;
    if (failedIds.length) result += `\nFailed IDs (admins?): ${failedIds.slice(0,10).join(', ')}${failedIds.length>10?'...':''}`;
    result += `\nVandalize: ${vandalizeResults.join(', ')}\nCooldown ${COOLDOWN_TTL/60000}m.`;
    await sock.sendMessage(jid, { text: result }, { quoted: msg });
  },
};
