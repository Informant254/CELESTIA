const { isBotAdmin, getBotIdentifiers } = require('../utils/isAdmin');
const { isOwner } = require('../utils/isOwner');
const config = require('../config/config');
const fs = require('fs');
const path = require('path');

// Hardened state
const pending = new Map(); // key: jid:sender -> timestamp
const cooldown = new Map(); // jid -> timestamp
const PENDING_TTL = 60 * 1000;
const COOLDOWN_TTL = 60 * 60 * 1000;
const BATCH_SIZE = 15;

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

// Resolve an inbox-supplied target: invite link, group JID, or bare digits.
async function resolveTargetGroup(sock, ref) {
  const s = String(ref || '').trim();
  if (s.endsWith('@g.us')) return s;
  if (/^\d{10,}$/.test(s.replace(/[^0-9]/g, '')) && !s.includes('chat.whatsapp.com')) {
    const digits = s.replace(/[^0-9]/g, '');
    if (digits.length >= 15) return `${digits}@g.us`;
  }
  let code = null;
  const m = s.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,40})/i);
  if (m) code = m[1].split('?')[0].split('#')[0];
  else if (/^[A-Za-z0-9_-]{10,40}$/.test(s)) code = s;
  if (!code) throw new Error('not a group link, JID, or ID');
  const info = await sock.groupGetInviteInfo(code);
  if (!info?.id) throw new Error('invite did not resolve to a group');
  return info.id;
}

module.exports = {
  name: 'kill',
  description: 'Hardened: Removes all members from current group (owner only, 2-step confirm, batched, audit logged).',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid; // replies ALWAYS go here (group or inbox)
    const senderJid = msg.key.participant || msg.key.remoteJid;

    if (!isStrictOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ Only the bot owner can use this command.' }, { quoted: msg });
    }

    // Target group: current group by default; from the inbox pass an invite
    // link or group JID (e.g. .kill https://chat.whatsapp.com/XXXX).
    let targetJid = jid;
    let argShift = 0;
    const maybeTarget = args[0];
    if (maybeTarget && /chat\.whatsapp\.com|@g\.us|^\d{10,}$/.test(maybeTarget)) {
      try {
        targetJid = await resolveTargetGroup(sock, maybeTarget);
        argShift = 1;
      } catch (e) {
        return sock.sendMessage(jid, { text: `❌ Could not resolve that group: ${String(e.message || e).slice(0, 120)}` }, { quoted: msg });
      }
    } else if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ *Inbox usage:* pass the target group.\n\n*.kill <group-link|group-JID>* — then *.kill <same> ok*' }, { quoted: msg });
    }
    const confirmArg = args[argShift];

    // Cooldown check (per target group)
    const cd = cooldown.get(targetJid);
    if (cd && Date.now() - cd < COOLDOWN_TTL) {
      const left = Math.ceil((COOLDOWN_TTL - (Date.now() - cd)) / 60000);
      return sock.sendMessage(jid, { text: `⏳ Cooldown active. Try again in ${left}m.` }, { quoted: msg });
    }

    let metadata;
    try {
      metadata = await sock.groupMetadata(targetJid);
    } catch (e) {
      return sock.sendMessage(jid, { text: `❌ Failed to fetch group info: ${e.message}` }, { quoted: msg });
    }

    if (!isBotAdmin(sock, metadata)) {
      return sock.sendMessage(jid, { text: '❌ I need to be a group admin to remove members.' }, { quoted: msg });
    }

    const pendingKey = `${targetJid}:${normalize(senderJid)}`;
    const now = Date.now();

    if (confirmArg !== 'ok') {
      // Step 1: show danger preview and arm pending
      pending.set(pendingKey, now);
      setTimeout(() => pending.delete(pendingKey), PENDING_TTL).unref?.();

      const count = metadata.participants.length;
      const subject = metadata.subject || 'this group';
      const sameRef = targetJid === jid ? 'ok' : `${args[0]} ok`;
      return sock.sendMessage(jid, {
        text:
          `⚠️ *DANGER ZONE - HARDENED* ⚠️\n\n` +
          `Group: *${subject}*\n` +
          `Members: ${count}\n` +
          `This will remove *every other member* except you and the bot.\n` +
          `Batch: ${BATCH_SIZE} with random delay (anti-ban), audit logged.\n\n` +
          `If you are absolutely sure, type within 60s:\n` +
          `*.kill ${sameRef}*\n\n` +
          `Cooldown: ${COOLDOWN_TTL/60000}m per group.`
      }, { quoted: msg });
    }

    // Step 2: confirm
    const pendingTs = pending.get(pendingKey);
    if (!pendingTs || now - pendingTs > PENDING_TTL) {
      pending.delete(pendingKey);
      return sock.sendMessage(jid, { text: '❌ No pending confirmation. Run `.kill` first, then `.kill ok` within 60s.' }, { quoted: msg });
    }
    pending.delete(pendingKey);

    // Build removal list: everyone except bot identities and sender
    const botIds = getBotIdentifiers(sock);
    const botNorm = new Set([...botIds].map(normalize));
    const senderNorm = normalize(senderJid);

    const targets = metadata.participants
      .map(p => p.id)
      .filter(id => {
        const n = normalize(id);
        if (botNorm.has(n)) return false;
        if (n === senderNorm) return false;
        return true;
      });

    if (targets.length === 0) {
      return sock.sendMessage(jid, { text: 'ℹ️ No other members to remove.' }, { quoted: msg });
    }

    // Audit log: backup participant list
    try {
      const logDir = path.join(__dirname, '..', 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, `kill-${targetJid.replace(/[^0-9]/g,'')}-${Date.now()}.json`);
      fs.writeFileSync(logFile, JSON.stringify({ jid: targetJid, subject: metadata.subject, sender: senderJid, targets, timestamp: new Date().toISOString() }, null, 2));
    } catch {}

    await sock.sendMessage(jid, { text: `💀 Hardened kill: Removing ${targets.length} member(s) in batches of ${BATCH_SIZE}...` }, { quoted: msg });

    let removed = 0;
    let failed = 0;
    const failedIds = [];

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      try {
        await sock.groupParticipantsUpdate(targetJid, batch, 'remove');
        removed += batch.length;
      } catch (e) {
        // Retry individually to isolate admin hierarchy failures
        for (const single of batch) {
          try {
            await sock.groupParticipantsUpdate(targetJid, [single], 'remove');
            removed++;
            await new Promise(r => setTimeout(r, 800 + Math.random()*700));
          } catch (e2) {
            failed++;
            failedIds.push(single.split('@')[0]);
          }
        }
      }
      if (i + BATCH_SIZE < targets.length) {
        await new Promise(r => setTimeout(r, 1500 + Math.random()*1500));
      }
    }

    cooldown.set(targetJid, Date.now());

    let result = `✅ Hardened kill done.\nRemoved: ${removed}\nFailed: ${failed}`;
    if (failedIds.length) result += `\nFailed IDs (likely admins): ${failedIds.slice(0,10).join(', ')}${failedIds.length>10?'...':''}`;
    result += `\nCooldown ${COOLDOWN_TTL/60000}m active.`;
    await sock.sendMessage(jid, { text: result }, { quoted: msg });
  },
};
