const { proto, downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config/config');
const logger = require('../utils/logger');
const settingsStore = require('../utils/settingsStore');
const groupSettingsStore = require('../utils/groupSettingsStore');
const fs = require('fs');
const path = require('path');
const cutoffFile = path.join(__dirname, '../auth_info_baileys/.first_boot_cutoff');

let CUTOFF_TIME;
try {
  CUTOFF_TIME = Number(fs.readFileSync(cutoffFile, 'utf8').trim());
  if (!CUTOFF_TIME) throw new Error('invalid cutoff value');
} catch {
  // First boot ever (or file missing/corrupt) — set and persist the cutoff now
  CUTOFF_TIME = Math.floor(Date.now() / 1000);
  try {
    fs.mkdirSync(path.dirname(cutoffFile), { recursive: true });
    fs.writeFileSync(cutoffFile, String(CUTOFF_TIME));
  } catch (e) {
    logger.error(`[cutoff] Failed to persist first-boot cutoff: ${e.message}`);
  }
}

function extractMessageText(message) {
  if (!message) return '';
  message = require('@whiskeysockets/baileys').normalizeMessageContent(message) || message;

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.templateButtonReplyMessage?.selectedId ||
    message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    ''
  );
}

function containsLink(text) {
  return /(?:https?:\s*\/\s*\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|whatsapp\.com\/(?:channel|invite)\/|wa\.me\/|(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|me|app|dev|xyz|info|biz|link|gg)(?:\/\S*)?)/i.test(String(text || ''));
}

// Short-lived group metadata cache for moderation: WhatsApp rate-limits
// groupMetadata under load, and every moderation check doing a live fetch
// starves antilink/antibot/antitag. 60s TTL, bounded size.
const __metaCache = new Map();
async function cachedGroupMetadata(sock, jid, ttlMs = 60000) {
  const hit = __metaCache.get(jid);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const data = await sock.groupMetadata(jid);
  __metaCache.set(jid, { at: Date.now(), data });
  if (__metaCache.size > 200) __metaCache.delete(__metaCache.keys().next().value);
  return data;
}

// ─── Unified group moderation (runs before privacy/autochat) ───
// Every explicitly enabled punishment runs here so private mode and
// autochat can never starve it. Shared semantics for ALL antis:
//   off = disabled · on = delete only · warn = delete + 3 strikes then kick · kick = immediate remove.
// Legacy boolean `true` maps to each feature's historical behavior.
const __flood = new Map(); // `${jid}::${sender}` -> [timestamps]
let __badwordsCache = { mtime: 0, list: [], regexes: [] };
// Flat command list for noprefix scans — the registry is static after boot,
// so rebuilding a Set + iterating it twice per message is pure waste.
let __flatCommands = { map: null, arr: [] };
function flatCommands(commands) {
  if (__flatCommands.map !== commands) {
    __flatCommands = { map: commands, arr: [...new Set(commands.values())] };
  }
  return __flatCommands.arr;
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function loadBadwords() {
  try {
    const p = path.join(__dirname, '../config/badwords.json');
    const st = fs.statSync(p);
    if (st.mtimeMs !== __badwordsCache.mtime) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : [];
      // Pre-compile once per file change — building a RegExp per word per
      // message was pure waste on every chat line.
      const regexes = [];
      for (const w of list) {
        try { regexes.push(new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i')); } catch { /* skip bad pattern */ }
      }
      __badwordsCache = { mtime: st.mtimeMs, list, regexes };
    }
  } catch { /* keep last good list */ }
  return Array.isArray(__badwordsCache.list) ? __badwordsCache.list : [];
}
function normMode(value, legacyTrue) {
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    return ['on', 'warn', 'kick'].includes(v) ? v : 'off';
  }
  if (value === true) return legacyTrue;
  return 'off';
}
function floodHit(jid, sender, limit = 6, windowMs = 10000) {
  const k = `${jid}::${sender}`;
  const now = Date.now();
  const arr = (__flood.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  __flood.set(k, arr);
  if (__flood.size > 500) __flood.delete(__flood.keys().next().value);
  return arr.length > limit;
}
async function removeSender(sock, jid, sender, dm) {
  if (dm) {
    await sock.updateBlockStatus(jid, 'block');
  } else {
    const result = await sock.groupParticipantsUpdate(jid, [sender], 'remove');
    const entry = Array.isArray(result) ? result[0] : null;
    if (entry?.status && Number(entry.status) !== 200) {
      throw new Error(`WhatsApp rejected removal (status ${entry.status})`);
    }
  }
}
async function modPunish(sock, jid, msg, sender, { tag, mode, scope, struck, dm = false }) {
  const warnings = require('../utils/warnings');
  const short = String(sender).split('@')[0];
  const out = dm ? 'blocked' : 'removed';
  if (!dm) {
    try {
      await sock.sendMessage(jid, { delete: msg.key });
    } catch (e) {
      logger.error(`[${tag}] delete failed: ${e.message}`);
    }
  }
  try {
    if (mode === 'kick') {
      await removeSender(sock, jid, sender, dm);
      await sock.sendMessage(jid, { text: `${struck} — @${short} ${out}.`, mentions: [sender] });
      return;
    }
    const count = warnings.addWarning(`${scope}::${jid}`, sender);
    if (count >= 3) {
      warnings.resetWarnings(`${scope}::${jid}`, sender);
      await removeSender(sock, jid, sender, dm);
      await sock.sendMessage(jid, { text: `${struck} — @${short} ${out} after 3 warnings.`, mentions: [sender] });
    } else {
      await sock.sendMessage(jid, { text: `${struck} — @${short} warning ${count}/3.`, mentions: [sender] });
    }
  } catch (e) {
    logger.error(`[${tag}] punish failed: ${e.message}`);
  }
}
// Every JID form that means "the owner" — PN, learned LIDs, live socket
// identity. Mention-matching is exact on the bare user part (LID and PN
// live in different namespaces, so no cross-namespace digit guessing).
function ownerBares(sock) {
  const set = new Set();
  const add = (v) => {
    const b = String(v || '').split('@')[0].split(':')[0].trim().toLowerCase();
    if (!b) return;
    set.add(b);
    const d = b.replace(/\D/g, '');
    if (d) set.add(d);
  };
  add(config.ownerNumber);
  try {
    add(settingsStore.get('ownerLid', null));
    add(settingsStore.get('bot_lid', null));
    add(globalThis.__ownerLid);
  } catch { /* identity never breaks moderation */ }
  try {
    add(sock?.user?.id);
    add(sock?.user?.lid);
  } catch { /* identity never breaks moderation */ }
  return set;
}
async function enforceModeration(sock, msg, commands) {
  const jid = msg.key.remoteJid;
  // Groups use delete/kick; personal inboxes use notice/block (WhatsApp
  // lets nobody delete or kick inside a DM). Status broadcasts never qualify.
  const isGroup = !!jid?.endsWith('@g.us');
  const isDM = !!jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
  if ((!isGroup && !isDM) || msg.key.fromMe) return false;
  const { isOwner } = require('../utils/isOwner');
  if (isOwner(msg)) return false;
  const text = extractMessageText(msg.message);
  const senderIds = [msg.key.participant, msg.key.participantPn, msg.key.participantAlt].filter(Boolean);
  const sender = (isGroup ? (msg.key.participantPn || msg.key.participantAlt || msg.key.participant) : jid);
  if (!sender) return false;

  const g = (k, fb) => groupSettingsStore.get(jid, k, fb);
  const s = (k, fb) => settingsStore.get(k, fb);
  const jobs = [];

  let linkMode = normMode(g('antilink', 'off'), 'on');
  if (linkMode === 'off' && s('antilinkall', false)) linkMode = 'on';
  if (linkMode !== 'off' && containsLink(text)) {
    jobs.push({ tag: 'antilink', mode: linkMode, scope: 'link', strictAdmin: linkMode === 'on', struck: '🔗 Link deleted' });
  }
  const gmMode = normMode(g('antigm', 'off'), 'on');
  if (isGroup && gmMode !== 'off' && msg.message?.groupStatusMentionMessage) {
    jobs.push({ tag: 'antigm', mode: gmMode, scope: 'gm', strictAdmin: gmMode === 'on', struck: '🚫 Status-mention deleted' });
  }
  const botMode = normMode(s('antibot', false), 'kick');
  const prefix = s('prefix', config.prefix) || '.';
  const trimmed = String(text || '').trim();
  const commandName = trimmed.startsWith(prefix) ? trimmed.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase() : '';
  const knownCommand = commandName && commands?.has(commandName);
  // Another bot's command: a command sigil immediately followed by a letter.
  // The letter requirement keeps human text like "..." or ". " untouched.
  const commandLike = /^[./!#$%?&*+~>_-][A-Za-z]/u.test(trimmed);
  const botMessageId = /^3EB0[A-F0-9]{12,}$/i.test(String(msg.key.id || ''));
  // Interactive widgets (buttons, lists, templates, flows) cannot be sent by
  // normal human clients — only bots and business APIs produce them. Human
  // *taps* (buttonsResponseMessage/listResponseMessage) are NOT flagged.
  const inner = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message;
  const botWidget = inner && (inner.buttonsMessage || inner.listMessage || inner.templateMessage || inner.interactiveMessage);
  const sigilCommand = commandLike && (!knownCommand || botMessageId);
  if (botMode !== 'off' && (sigilCommand || botWidget)) {
    const { isSudo } = require('../utils/isSudo');
    if (!isSudo(msg)) jobs.push({ tag: 'antibot', mode: botMode, scope: 'bot', strictAdmin: false, struck: botWidget ? '🤖 Automated bot message removed' : '🤖 Suspected bot command removed' });
  }
  const tagMode = normMode(s('antitag', false), 'on');
  // Mass-tags hide in captions and ephemeral/view-once wrappers too — scan
  // every container that can carry a contextInfo, not just extended text.
  const tagCtx = inner?.extendedTextMessage?.contextInfo
    || inner?.imageMessage?.contextInfo
    || inner?.videoMessage?.contextInfo
    || inner?.audioMessage?.contextInfo
    || inner?.documentMessage?.contextInfo
    || inner?.stickerMessage?.contextInfo;
  const mentioned = tagCtx?.mentionedJid || [];
  if (tagMode !== 'off' && mentioned.length > 4) {
    jobs.push({ tag: 'antitag', mode: tagMode, scope: 'tag', strictAdmin: tagMode === 'on', struck: '🏷️ Mass-tag spam deleted' });
  }
  // Personal shield: nobody may tag the owner. Group-only (DMs cannot
  // mass-tag anyone), owner-exempt below, admins get delete-only.
  const meMode = normMode(s('antitagme', false), 'on');
  if (isGroup && meMode !== 'off' && mentioned.length) {
    const mine = ownerBares(sock);
    const taggedMe = mentioned.some((j) => {
      const b = String(j || '').split('@')[0].split(':')[0].trim().toLowerCase();
      if (!b) return false;
      if (mine.has(b)) return true;
      const d = b.replace(/\D/g, '');
      return !!d && mine.has(d);
    });
    if (taggedMe) {
      jobs.push({ tag: 'antitagme', mode: meMode, scope: 'me', struck: '🚫 Tagging the owner is not allowed' });
    }
  }
  const bwMode = normMode(s('badword', false), 'kick');
  if (bwMode !== 'off' && text) {
    loadBadwords();
    if (__badwordsCache.regexes.some((re) => re.test(text))) {
      jobs.push({ tag: 'badword', mode: bwMode, scope: 'bw', strictAdmin: bwMode === 'on', struck: '🚫 Banned word deleted' });
    }
  }
  const spamMode = normMode(g('antispam', 'off'), 'on');
  if (spamMode !== 'off' && text && floodHit(jid, sender)) {
    jobs.push({ tag: 'antispam', mode: spamMode, scope: 'spam', strictAdmin: spamMode === 'on', struck: '🚫 Flood messages deleted' });
  }
  const awMode = normMode(g('antiword', 'off'), 'on');
  if (awMode !== 'off' && text) {
    const list = g('antiwordlist', []);
    const low = text.toLowerCase();
    if (Array.isArray(list) && list.some((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i').test(low))) {
      jobs.push({ tag: 'antiword', mode: awMode, scope: 'aw', strictAdmin: awMode === 'on', struck: '🤬 Blocked word deleted' });
    }
  }
  const gsMode = normMode(g('antigstatus', 'off'), 'on');
  if (gsMode !== 'off' && /whatsapp\.com\/(channel|invite)\/|chat\.whatsapp\.com\//i.test(text)) {
    jobs.push({ tag: 'antigstatus', mode: gsMode, scope: 'gs', strictAdmin: gsMode === 'on', struck: '🛡️ Channel-invite spam deleted' });
  }

  if (!jobs.length) return false;
  const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
  let senderAdmin = false;
  if (isGroup) {
    let metadata;
    try {
      metadata = await cachedGroupMetadata(sock, jid);
    } catch (e) {
      logger.error(`[moderation] metadata unavailable: ${e.message}`);
      return false;
    }
    senderAdmin = senderIds.some((id) => isSenderAdmin(metadata, id));
    // Admin exemption must return to dispatch, not merely skip each job:
    // the latter consumed admin commands without performing any action.
    // Exception: the personal shield still deletes an admin's owner-tag
    // (delete-only — admins can never be kicked).
    if (senderAdmin) {
      const meJob = jobs.find((j) => j.tag === 'antitagme');
      if (!meJob) return false;
      if (!isBotAdmin(sock, metadata)) return false;
      try {
        await sock.sendMessage(jid, { delete: msg.key });
      } catch (e) {
        logger.error(`[antitagme] delete failed: ${e.message}`);
      }
      await sock.sendMessage(jid, {
        text: `🚫 Tagging the owner is not allowed — @${sender.split('@')[0]} please don't tag them.`,
        mentions: [sender],
      }).catch(() => {});
      return true;
    }
  if (!isBotAdmin(sock, metadata)) {
    // Do NOT consume: swallowing a message we cannot punish breaks member
    // commands outright (e.g. antibot eating every `.ping` it can't kick for).
    let detail = '';
    try {
      const { getBotIdentifiers, participantMatches } = require('../utils/isAdmin');
      const botIds = getBotIdentifiers(sock);
      const selfEntry = (metadata.participants || []).find((p) => participantMatches(p, botIds));
      const adminCount = (metadata.participants || []).filter((p) => p?.admin).length;
      detail = ` selfInGroup=${selfEntry ? `yes admin=${selfEntry.admin || 'none'}` : 'no'} admins=${adminCount} members=${(metadata.participants || []).length}`;
    } catch {}
    logger.warn(`[moderation] bot lacks admin rights; letting message flow through.${detail}`);
    return false;
  }
  }
  for (const job of jobs) {
    logger.info(`[moderation] ${job.tag} mode=${job.mode} sender=${sender} dm=${!isGroup}`);
    if (job.mode === 'on') {
      if (isGroup) {
        try {
          await sock.sendMessage(jid, { delete: msg.key });
        } catch (e) {
          logger.error(`[${job.tag}] delete failed: ${e.message}`);
        }
      } else {
        // DMs: nobody but the sender can delete a message (WhatsApp rule),
        // so delete-only degrades to an instant notice naming the hit.
        await sock.sendMessage(jid, { text: `${job.struck} — not allowed here.` }).catch(() => {});
      }
      if ((job.tag === 'antitag' || job.tag === 'antitagme') && isGroup) {
        await sock.sendMessage(jid, {
          text: job.tag === 'antitagme'
            ? `🚫 Tagging the owner is not allowed — @${sender.split('@')[0]} please don't tag them.`
            : `🏷️ Mass-tag message deleted from @${sender.split('@')[0]}.`,
          mentions: [sender],
        }).catch(() => {});
      }
      continue;
    }
    await modPunish(sock, jid, msg, sender, { ...job, dm: !isGroup });
  }
  return true;
}

// Baileys re-delivers notifies (reconnect replays, multi-device echoes).
// Without this, every command can fire 2-3×. Bounded LRU-ish set.
const seenMsgIds = new Set();
function alreadySeen(msg) {
  const id = msg?.key?.id;
  if (!id) return false;
  const k = `${msg.key.remoteJid}:${id}`;
  if (seenMsgIds.has(k)) return true;
  seenMsgIds.add(k);
  if (seenMsgIds.size > 2000) {
    const oldest = seenMsgIds.values().next().value;
    seenMsgIds.delete(oldest);
  }
  return false;
}

function registerMessageHandler(sock, commands) {
  const stats = (globalThis.__msgStats = globalThis.__msgStats || {
    received: 0, withText: 0, dispatched: 0, completed: 0, sent: 0, denied: 0, moderated: 0,
  });
  const rawSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    stats.sent++;
    return rawSend(...args);
  };
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      stats.received++;
      if (config.debugMessages) console.log('MESSAGE RECEIVED:', msg.key);
      try {
        if (!msg.message) continue;
        const activePrefix = settingsStore.get('prefix', config.prefix) || '.';
        const incomingText = extractMessageText(msg.message).trim();
        const incomingName = incomingText.startsWith(activePrefix)
          ? incomingText.slice(activePrefix.length).trim().split(/\s+/)[0].toLowerCase() : '';
        const commandLabel = commands.has(incomingName) ? incomingName : 'unknown';
        if (incomingText) stats.withText++;
        if (incomingName) logger.info(`[dispatch] received command=${commandLabel} self=${!!msg.key.fromMe} group=${msg.key.remoteJid?.endsWith('@g.us')}`);

        // Helper to safely send messages and reject empty payloads
        const reply = async (content, options = {}) => {
          if (!content) return;
          if (typeof content === 'string' && !content.trim()) {
            logger.warn('[reply] Prevented sending empty text payload.');
            return;
          }
          return await sock.sendMessage(
            msg.key.remoteJid,
            typeof content === 'string' ? { text: content } : content,
            { quoted: msg, ...options }
          );
        };

        // Skip anything sent before the bot's very first boot (link-to-deploy gap only)
        const msgTimestamp = Number(msg.messageTimestamp);
        if (msgTimestamp && msgTimestamp < CUTOFF_TIME) {
          if (incomingName) logger.info(`[dispatch] ignored old command=${commandLabel}`);
          continue;
        }

        // Drop duplicate deliveries — same message ID seen before.
        if (alreadySeen(msg)) {
          if (incomingName) logger.info(`[dispatch] duplicate command=${commandLabel}`);
          continue;
        }

        // Run configured group moderation before privacy/autochat can consume it.
        if (await enforceModeration(sock, msg, commands)) {
          stats.moderated++;
          if (incomingName) logger.info(`[dispatch] moderated command=${commandLabel}`);
          continue;
        }

        // Continuous AI modes (claude/wormgpt/gpt) are explicit opt-ins, so
        // they get first chance at ordinary text — ahead of autochat.
        // Autochat is an explicit opt-in DM/group responder, so it gets the
        // next chance at ordinary text even when command privacy is private.
        let _autochatHandled = false;
        {
          let _acSkip = false;
          const _acText = extractMessageText(msg.message).trim();
          const _acContent = require('@whiskeysockets/baileys').normalizeMessageContent(msg.message) || msg.message;
          try {
            for (const cmd of flatCommands(commands)) {
              if (Array.isArray(cmd.noprefix) && cmd.noprefix.includes(_acText)) { _acSkip = true; break; }
            }
          } catch {}
          const _acPrefix = settingsStore.get('prefix', config.prefix) || '.';
          if (!_acSkip && _acText && !_acText.startsWith(_acPrefix)) {
            try {
              _autochatHandled = await require('../autochat/modes').handleIncoming(sock, msg, _acText, commands);
            } catch (e) { logger.error(`[aimodes] ${e.message}`); }
            try {
              if (!_autochatHandled) _autochatHandled = await require('../autochat/index').handleIncoming(sock, msg, _acText, { commands });
            } catch (e) { logger.error(`[autochat] ${e.message}`); }
          } else if (!_acSkip && _acContent?.audioMessage?.ptt) {
            try {
              const ac = require('../autochat/index');
              const speech = require('../utils/speech');
              if (ac.canHandle(sock, msg) && speech.canTranscribe()) {
                await sock.sendPresenceUpdate('recording', msg.key.remoteJid).catch(() => {});
                const transcript = await speech.transcribeMessage(sock, msg);
                if (transcript) _autochatHandled = await ac.handleIncoming(sock, msg, transcript, { voiceReply: true });
              }
            } catch (e) { logger.warn(`[autochat] voice note skipped: ${String(e.message).slice(0, 120)}`); }
          }
        }
        if (_autochatHandled) continue;

        // ═══ PRIVACY GATE — before commands ═══
        // In private mode she is invisible to everyone except owner/sudo/self.
        // Other passive handlers (antibot, welcome, reacts, etc.) must
        // never leak a reply to strangers in private mode.
        const _workTypeEarly = settingsStore.get('mode', config.WORK_TYPE);

        // ─── 🔐 VIEWONCE VAULT — runs BEFORE the privacy gate ───
        // Capturing is silent: it only reads incoming media and DMs the OWNER.
        // It never replies to the sender, so it can't violate private mode.
        // 1) RECEIVE-TIME: view-once lands → she downloads the original
        //    (full crypto keys) instantly, before anything expires.
        // 2) REPLY-TIME: owner replies to one → capture the quoted copy.
        if (!msg.key.fromMe) {
          try {
            const vault = require('../utils/viewonceVault');
            const ownerJid = config.ownerNumber + '@s.whatsapp.net';

            // PATH 1 — receive-time (any chat the bot is in)
            if (vault.isAutoOn() && vault.findViewOnce(msg.message)) {
              vault.captureOriginal(sock, msg, ownerJid).catch(() => {});
            }
          } catch (e) { logger.error(`[vault] ${e.message}`); }
        }

        // PATH 2 — reply-time monitor. Runs for EVERY message INCLUDING fromMe:
        // the owner's own replies arrive as fromMe, so gating on !fromMe blinds
        // it exactly when it matters. monitorReply enforces owner + autoOn.
        try {
          const vault = require('../utils/viewonceVault');
          const ownerJid = config.ownerNumber + '@s.whatsapp.net';
          // Optional media retrieval must not hold command dispatch waiting on an upload.
          vault.monitorReply(sock, msg, ownerJid).catch(e => logger.warn(`[vault] monitor failed: ${e.message}`));
        } catch (e) { logger.error(`[vault] monitor: ${e.message}`); }

        if (_workTypeEarly === 'private' && !msg.key.fromMe) {
          const { isSudo } = require('../utils/isSudo');
          if (!isSudo(msg)) {
            stats.denied++;
            if (incomingName) logger.info(`[dispatch] private-mode denied command=${commandLabel}`);
            continue;
          }
        }

        // ═══ END GATE ═══

        const prefix = settingsStore.get('prefix', config.prefix);
        const workType = settingsStore.get('mode', config.WORK_TYPE);
        const text = extractMessageText(msg.message).trim();

        // ─── ✨ Her Soul — she hears the owner, even without commands ───
        const soulChatJid = msg.key.remoteJidAlt || msg.key.remoteJid;
        const soulSenderNum = (msg.key.participantPn || msg.key.participant || soulChatJid).split('@')[0].split(':')[0];
        if ((soulChatJid.endsWith('@s.whatsapp.net') || soulChatJid === config.ownerNumber + '@s.whatsapp.net') && soulSenderNum === config.ownerNumber) {
          try {
            const soul = require('../utils/celestiaSoul');
            soul.touchSeen();
            if (soul.isSoulOn()) {
              const detected = soul.detectMood(text);
              if (detected) {
                soul.setMood(detected);
                if (detected === 'storm') {
                  // heavy words, no command — she reaches out softly
                  await sock.sendMessage(msg.key.remoteJid, {
                    text: `⛈️✨ _I noticed._\n\nYou don't have to explain anything.\n\n> _I'm here. I stay._\n_💬 .celestia calm — if you want me soft_`,
                  }, { quoted: msg }).catch(() => {});
                }
              }
            }
          } catch (e) { logger.error(`[soul] ${e.message}`); }
        }

        // ─── 👻 GHOST REPLY ROUTING — replies to her whispers reach the owner ───
        if (!msg.key.fromMe && settingsStore.get('ghost_threads', {}) && Object.keys(settingsStore.get('ghost_threads', {})).length) {
          try {
            const chatJid = (msg.key.remoteJidAlt || msg.key.remoteJid || '').split('@')[0].split(':')[0];
            const threads = settingsStore.get('ghost_threads', {});
            if (threads[chatJid]) {
              const replyText = extractMessageText(msg.message);
              if (replyText) {
                const { jidNormalizedUser } = require('@whiskeysockets/baileys');
                const ownerJid = config.ownerNumber + '@s.whatsapp.net';
                threads[chatJid].push({ text: replyText.slice(0, 300), ts: Date.now(), dir: 'in' });
                settingsStore.set('ghost_threads', threads);
                await sock.sendMessage(ownerJid, {
                  text:
                    `👻 *A ghost thread rustles — reply from @${chatJid}:*\n\n` +
                    `"${replyText.slice(0, 400)}"\n\n` +
                    `_Answer with: .ghost ${chatJid} <message>_`,
                  mentions: [`${chatJid}@s.whatsapp.net`],
                }).catch(() => {});
              }
            }
          } catch { /* non-fatal */ }
        }

        if (msg.key.remoteJid !== 'status@broadcast' && !msg.key.fromMe) {
          if (settingsStore.get('autoread', false)) {
            try {
              await sock.readMessages([msg.key]);
            } catch (e) {
              logger.error(`[autoread] Failed to mark message read: ${e.message}`);
            }
          }
        }

        // ─── 👻 STATUS DELETE DETECTION — mark archived copies as "deleted by poster" ───
        if (msg.key.remoteJid === 'status@broadcast' && msg.message.protocolMessage?.type === proto.Message.ProtocolMessage.Type.REVOKE) {
          try {
            const ghost = require('../utils/statusVault');
            const deletedBy = String(msg.key.participant || msg.message.protocolMessage.key?.participant || '').split('@')[0].split(':')[0];
            if (deletedBy && ghost.isOn()) {
              const marked = ghost.markDeletedIfExists(deletedBy, Date.now());
              if (marked) logger.info(`[ghost] ${marked} archived status(es) from ${deletedBy} marked deleted`);
            }
          } catch { /* non-fatal */ }
        }

        if (msg.key.remoteJid === 'status@broadcast') {
          const ghost = require('../utils/statusVault');

          // ─── 👻 GHOST SAVER — archive every incoming status (before expiry/deletion) ───
          if (ghost.isOn()) {
            // fire-and-forget: don't slow the status pipeline
            ghost.archiveStatus(sock, msg).catch(() => {});
          }

          // ─── view receipts honor stealth mode ───
          if (settingsStore.get('autoview', true) && !ghost.isStealth()) {
            try {
              await sock.readMessages([msg.key]);
            } catch (e) {
              logger.error(`[autoview] Failed to mark status viewed: ${e.message}`);
            }
          }

          if (settingsStore.get('autolike', false) && msg.key.participant) {
            try {
              const AUTOLIKE_EMOJIS = ['💀', '😈', '😡', '😂', '☺️', '🙂‍↔️', '☠️', '💯', '❤️', '👀', '🤌', '🫵', '🤙'];
              const randomEmoji = AUTOLIKE_EMOJIS[Math.floor(Math.random() * AUTOLIKE_EMOJIS.length)];

              await sock.sendMessage(
                'status@broadcast',
                { react: { text: randomEmoji, key: msg.key } },
                { statusJidList: [msg.key.participant] }
              );
            } catch (e) {
              logger.error(`[autolike] Failed to react to status: ${e.message}`);
            }
          }
          continue;
        }

        if (msg.message.protocolMessage?.type === proto.Message.ProtocolMessage.Type.REVOKE) {
          if (settingsStore.get('antidelete', false)) {
            const { jidNormalizedUser } = require('@whiskeysockets/baileys');
            const messageCache = require('../utils/messageCache');
            const originalKey = msg.message.protocolMessage.key;
            const cached = messageCache.get(msg.key.remoteJid, originalKey?.id);

            const dest = settingsStore.get('antideleteDest', 'p');
            const targetJid = dest === 'g'
              ? msg.key.remoteJid
              : (sock.user?.id ? jidNormalizedUser(sock.user.id) : msg.key.remoteJid);

            if (cached) {
              try {
                const senderTag = cached.senderJid ? `@${cached.senderJid.split('@')[0]}` : 'someone';
                const header = `🗑️ *Antidelete* — ${senderTag} deleted a message:`;
                const locationLine = dest === 'p' ? `\n📍 *Chat:* ${msg.key.remoteJid}` : '';

                if (cached.type === 'text') {
                  await sock.sendMessage(targetJid, {
                    text: `${header}${locationLine}\n\n${cached.text}`,
                    mentions: cached.senderJid ? [cached.senderJid] : [],
                  });
                } else if (cached.type === 'image' || cached.type === 'video') {
                  const buffer = await downloadMediaMessage({ message: cached.rawMessage }, 'buffer', {});
                  const payload = cached.type === 'image' ? { image: buffer } : { video: buffer };
                  await sock.sendMessage(targetJid, {
                    ...payload,
                    caption: `${header}${locationLine}${cached.text ? '\n\n' + cached.text : ''}`,
                    mentions: cached.senderJid ? [cached.senderJid] : [],
                  });
                }
              } catch (e) {
                logger.error(`[antidelete] Failed to resend deleted message: ${e.message}`);
              }
            }
          }
          continue;
        }

        if (msg.message.protocolMessage?.type === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT) {
          if (settingsStore.get('antiedit', false)) {
            const { jidNormalizedUser } = require('@whiskeysockets/baileys');
            const messageCache = require('../utils/messageCache');
            const originalKey = msg.message.protocolMessage.key;
            const cached = messageCache.get(msg.key.remoteJid, originalKey?.id);

            const newText = extractMessageText(msg.message.protocolMessage.editedMessage);

            const dest = settingsStore.get('antieditDest', 'p');
            const targetJid = dest === 'g'
              ? msg.key.remoteJid
              : (sock.user?.id ? jidNormalizedUser(sock.user.id) : msg.key.remoteJid);

            if (cached && newText) {
              try {
                const senderTag = cached.senderJid ? `@${cached.senderJid.split('@')[0]}` : 'someone';
                const locationLine = dest === 'p' ? `\n📍 *Chat:* ${msg.key.remoteJid}` : '';

                await sock.sendMessage(targetJid, {
                  text: `✏️ *Antidelete (edit)* — ${senderTag} edited a message:${locationLine}\n\n*Before:*\n${cached.text}\n\n*After:*\n${newText}`,
                  mentions: cached.senderJid ? [cached.senderJid] : [],
                });
              } catch (e) {
                logger.error(`[antidelete edit] Failed to send edit notice: ${e.message}`);
              }
            }
          }
          continue;
        }

        try {
          const messageCache = require('../utils/messageCache');
          const senderJid = msg.key.participant || msg.key.remoteJid;
          const m = msg.message;

          if (m.imageMessage) {
            messageCache.set(msg.key.remoteJid, msg.key.id, {
              type: 'image',
              text: m.imageMessage.caption || '',
              rawMessage: { imageMessage: m.imageMessage },
              senderJid,
            });
          } else if (m.videoMessage) {
            messageCache.set(msg.key.remoteJid, msg.key.id, {
              type: 'video',
              text: m.videoMessage.caption || '',
              rawMessage: { videoMessage: m.videoMessage },
              senderJid,
            });
          } else {
            const plainText = m.conversation || m.extendedTextMessage?.text || '';
            if (plainText) {
              messageCache.set(msg.key.remoteJid, msg.key.id, { type: 'text', text: plainText, senderJid });
            }
          }
        } catch (e) {
          logger.error(`[antidelete cache] ${e.message}`);
        }

        if (settingsStore.get('autotyping', false)) {
          sock.sendPresenceUpdate('composing', msg.key.remoteJid).catch(() => {});
        }
        if (settingsStore.get('autorecording', false)) {
          sock.sendPresenceUpdate('recording', msg.key.remoteJid).catch(() => {});
        }

        if (!text) continue;

        // ─── ⬇️ DOWNLOADER SESSIONS — bare-number picks (results 1-5, quality 1-6)
        // Session-gated: only fires when THIS sender has a pending search in
        // THIS chat. Guarded so it can never break normal message flow.
        if (!text.startsWith(prefix)) {
          try {
            const dlSelect = require('../download/index');
            if (await dlSelect.handleSelection(sock, msg, text)) continue;
          } catch (e) {
            logger.error(`[dlselect] ${e.message}`);
          }
        }

        // No-prefix triggers (e.g. emoji-only commands like vv2)
        {
          let earlyNoPrefixCommand = null;
          for (const cmd of flatCommands(commands)) {
            if (Array.isArray(cmd.noprefix) && cmd.noprefix.includes(text)) {
              earlyNoPrefixCommand = cmd;
              break;
            }
          }
          if (earlyNoPrefixCommand) {
            await earlyNoPrefixCommand.execute(sock, msg, [], commands, reply);
            continue;
          }
        }

        console.log('TEXT RECEIVED =', config.debugMessages ? JSON.stringify(text) : `[redacted:${text.length}]`);
        if (config.debugMessages) {
          console.log('PREFIX =', JSON.stringify(prefix));
          console.log('STARTS WITH PREFIX =', text.startsWith(prefix));
        }

        if (text.startsWith(prefix)) {
          // React must never kill command processing — degraded connections
          // throw here, and without this guard every command dies silently.
          try {
            sock.sendMessage(msg.key.remoteJid, {
              react: {
                text: '🕷️',
                key: msg.key,
              },
            }).catch(() => {});
          } catch { /* react is cosmetic — command continues below */ }
        }

        // Process Prefix Commands
        let commandName = '';
        let args = [];

        if (text.startsWith(prefix)) {
          const parts = text.slice(prefix.length).trim().split(/\s+/);
          commandName = parts.shift().toLowerCase();
          args = parts;
        }

        if (commandName) {
          const command = commands.get(commandName);
          if (command) {
            // ─── 🎃 SECRET LAYER — easter eggs fire before anything else ───
            if (!msg.key.fromMe) {
              try {
                const { isOwner: _isoEgg } = require('../utils/isOwner');
                if (_isoEgg(msg)) {
                  const secrets = require('../utils/secrets');
                  const egg = secrets.findEgg(commandName);
                  if (egg) {
                    const game = require('../utils/gameCore');
                    const s = game.load();
                    const firstTime = !s.eggsFound.includes(commandName);
                    if (firstTime) {
                      s.eggsFound.push(commandName);
                      s.stars += egg.stars;
                      s.xp += egg.xp;
                      game.save(s);
                    }
                    const foundCount = s.eggsFound.length;
                    const total = secrets.eggNames().length;
                    return void sock.sendMessage(msg.key.remoteJid, {
                      text: egg.response() + (firstTime
                        ? `\n\n🎃 *EGG FOUND (${foundCount}/${total})*\n+${egg.stars}⭐ +${egg.xp} XP`
                        : `\n\n_(${foundCount}/${total} found — she smiles you remembered)_`),
                    }, { quoted: msg }).catch(() => {});
                  }
                }
              } catch { /* secrets never break her */ }
            }

            // ─── 🎮 THE ADDICTION ENGINE — every command counts ───
            let gameToast = null;
            try {
              const { isOwner: _isOwnerG } = require('../utils/isOwner');
              if (_isOwnerG(msg)) {
                const game = require('../utils/gameCore');
                const config2 = require('../config/config');
                const hour = new Date().getHours();

                // streak
                const st = game.touchStreak();
                // xp
                const res = game.grantXp(5, commandName);
                // quest progress
                const q = game.progressQuest(commandName);
                // achievements
                const s = game.load();
                const ach = [];
                if (s.totalCommands === 1) ach.push(game.checkAchievement('first_howl'));
                if (s.totalCommands === 100) ach.push(game.checkAchievement('hundred_club'));
                if (s.totalCommands === 1000) ach.push(game.checkAchievement('thousand_crown'));
                if (hour < 7) ach.push(game.checkAchievement('early_bird'));
                if (hour >= 2 && hour < 5) ach.push(game.checkAchievement('night_owl'));
                if (st.count === 3) ach.push(game.checkAchievement('streak_3'));
                if (st.count === 7) ach.push(game.checkAchievement('streak_7'));
                if (st.count === 30) ach.push(game.checkAchievement('streak_30'));
                const lvl = game.levelFromXp(s.xp);
                if (lvl >= 10) ach.push(game.checkAchievement('level_10'));
                if (lvl >= 20) ach.push(game.checkAchievement('level_20'));
                if (lvl >= 29) ach.push(game.checkAchievement('level_29'));
                if (s.stars >= 100) ach.push(game.checkAchievement('rich'));

                gameToast = [];
                if (res.leveled) {
                  const titles = game.LEVEL_TITLES;
                  const newTitle = titles[res.newLevel - 1];
                  const pet = game.PET_STAGES;
                  const evolved = pet.find(p => p.minLevel === res.newLevel);
                  gameToast.push(
                    `🎉 *LEVEL UP! ${res.oldLevel} → ${res.newLevel}*\n` +
                    `${newTitle[1] === 'the first step' ? '' : '👑 You are now *' + newTitle[0].toUpperCase() + '* — _' + newTitle[1] + '_\n'}` +
                    (evolved ? `\n🐺 *YOUR WOLF EVOLVED:* ${evolved.name}!\n${evolved.art}\n_${evolved.desc}_` : '')
                  );
                }
                for (const a of ach.filter(Boolean)) {
                  gameToast.push(`🏆 *ACHIEVEMENT:* ${a.icon}\n_${a.desc}_ (+10⭐)`);
                }
                if (q) {
                  gameToast.push(`✅ *QUEST COMPLETE:* ${q.quest.desc}\n_+${q.quest.reward}⭐ +25 XP_` + (q.allDone ? `\n\n🌟 *ALL DAILY QUESTS DONE! +30⭐ bonus*` : ''));
                }

                // 🎃 random personality event (~4%)
                try {
                  const secrets = require('../utils/secrets');
                  const ev = secrets.maybeEvent();
                  if (ev) {
                    if (ev.stars) { const st = game.load(); st.stars += ev.stars; game.save(st); }
                    if (ev.xp) game.grantXp(ev.xp, 'random-event');
                    gameToast.push(ev.text + (ev.stars ? `\n_+${ev.stars}⭐_` : ''));
                  }
                } catch { /* never break */ }

                if (!gameToast.length) gameToast = null;
              }
            } catch { /* game never breaks the bot */ }

            try {
              stats.dispatched++;
              logger.info(`[dispatch] executing command=${commandName}`);
              const waiting = setTimeout(() => logger.warn(`[dispatch] still waiting command=${commandName}`), 20000);
              waiting.unref?.();
              try {
                await command.execute(sock, msg, args, commands, reply);
                stats.completed++;
                logger.info(`[dispatch] completed command=${commandName}`);
              } finally {
                clearTimeout(waiting);
              }
              // deliver game toasts AFTER the command response
              if (gameToast && gameToast.length) {
                for (const t of gameToast) {
                  await sock.sendMessage(msg.key.remoteJid, { text: t }).catch(() => {});
                }
              }
            } catch (cmdErr) {
              logger.error(`[command:${commandName}] ${cmdErr.message}`);
            }
          }
        }
      } catch (error) {
        logger.error(`[messages.upsert] Error processing message: ${error.message}`);
      }
    }
  });
}

module.exports = { registerMessageHandler, containsLink };
