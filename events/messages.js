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

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  );
}

function registerMessageHandler(sock, commands) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      console.log('MESSAGE RECEIVED:', msg.key);
      try {
        if (!msg.message) continue;

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
        if (msgTimestamp && msgTimestamp < CUTOFF_TIME) continue;

        // ═══ PRIVACY GATE — FIRST, before ANY handler or reply ═══
        // In private mode she is invisible to everyone except owner/sudo/self.
        // Passive handlers (antilink, antibot, welcome, reacts, etc.) must
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
            // PATH 2 — reply-time (owner replying to a quoted view-once)
            else {
              const { isOwner: _isOwner } = require('../utils/isOwner');
              if (_isOwner(msg)) {
                const ctx0 = msg.message?.extendedTextMessage?.contextInfo;
                const quoted0 = ctx0?.quotedMessage;
                if (quoted0 && vault.findViewOnce(quoted0) && vault.isAutoOn()) {
                  const senderJid = ctx0.participantPn || ctx0.participant || ctx0.participantAlt || msg.key.remoteJidAlt || msg.key.remoteJid;
                  vault.captureToVault(sock, quoted0, { remoteJid: msg.key.remoteJid, id: ctx0.stanzaId, participant: ctx0.participant }, senderJid, ownerJid)
                    .then(r => { if (r) logger.info(`[vault] reply-capture from ${r.entry.sender} (#${r.count})`); })
                    .catch(() => {});
                }
              }
            }
          } catch (e) { logger.error(`[vault] ${e.message}`); }
        }

        if (_workTypeEarly === 'private' && !msg.key.fromMe) {
          const { isSudo } = require('../utils/isSudo');
          if (!isSudo(msg)) continue; // total silence for strangers
        }
        // ═══ END GATE ═══

        if (msg.key.remoteJid.endsWith('@g.us')) {
          const groupSettingsStore = require('../utils/groupSettingsStore');
          const antigmMode = groupSettingsStore.get(msg.key.remoteJid, 'antigm', 'off');

          if (antigmMode !== 'off' && msg.message?.groupStatusMentionMessage) {
            const { isOwner } = require('../utils/isOwner');
            const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
            const senderJid = msg.key.participant || msg.key.remoteJid;

            if (!isOwner(msg)) {
              const metadata = await sock.groupMetadata(msg.key.remoteJid);
              if (!isSenderAdmin(metadata, senderJid) && isBotAdmin(sock, metadata)) {
                try {
                  await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });

                  if (antigmMode === 'kick') {
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                    await sock.sendMessage(msg.key.remoteJid, {
                      text: `status mention detected!!! @${senderJid.split('@')[0]} kicked 🚫`,
                      mentions: [senderJid],
                    });
                  } else if (antigmMode === 'warn') {
                    const { addWarning, resetWarnings } = require('../utils/warnings');
                    const count = addWarning(msg.key.remoteJid, senderJid);

                    if (count >= 3) {
                      resetWarnings(msg.key.remoteJid, senderJid);
                      await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                      await sock.sendMessage(msg.key.remoteJid, {
                        text: `status mention detected!!! @${senderJid.split('@')[0]} kicked 🚫`,
                        mentions: [senderJid],
                      });
                    } else {
                      await sock.sendMessage(msg.key.remoteJid, {
                        text: `⚠️WARNING⚠️\n*User :* @${senderJid.split('@')[0]}\n*Warn :* ${count}\n*Remaining :* ${3 - count}`,
                        mentions: [senderJid],
                      });
                    }
                  }
                } catch (e) {
                  logger.error(`[antigm] Failed to delete/act: ${e.message}`);
                }
                continue;
              }
            }
          }
        }

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
          await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
        }
        if (settingsStore.get('autorecording', false)) {
          await sock.sendPresenceUpdate('recording', msg.key.remoteJid);
        }

        if (!text) continue;

        // No-prefix triggers (e.g. emoji-only commands like vv2)
        {
          let earlyNoPrefixCommand = null;
          for (const cmd of new Set(commands.values())) {
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

        if (msg.key.remoteJid.endsWith('@g.us')) {
          let antilinkMode = groupSettingsStore.get(msg.key.remoteJid, 'antilink', 'off');
          if (settingsStore.get('antilinkall', false) && antilinkMode === 'off') {
            antilinkMode = 'on';
          }

          const linkRegex = /(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/)\S+/i;

          if (antilinkMode !== 'off' && linkRegex.test(text)) {
            const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
            const metadata = await sock.groupMetadata(msg.key.remoteJid);
            const senderJid = msg.key.participant || msg.key.remoteJid;

            if (!isSenderAdmin(metadata, senderJid)) {
              if (isBotAdmin(sock, metadata)) {
                try {
                  await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                } catch (e) {
                  logger.error(`[antilink] Failed to delete message: ${e.message}`);
                }

                if (antilinkMode === 'kick') {
                  try {
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                    await sock.sendMessage(
                      msg.key.remoteJid,
                      { text: `🔗🚫 @${senderJid.split('@')[0]} kicked for sending a link.`, mentions: [senderJid] }
                    );
                  } catch (e) {
                    logger.error(`[antilink] Failed to kick sender: ${e.message}`);
                    await sock.sendMessage(
                      msg.key.remoteJid,
                      { text: `🔗 Link deleted from @${senderJid.split('@')[0]}, but I couldn't remove them.`, mentions: [senderJid] }
                    );
                  }
                } else if (antilinkMode === 'warn') {
                  const { addWarning, resetWarnings } = require('../utils/warnings');
                  const count = addWarning(msg.key.remoteJid, senderJid);
                  if (count >= 3) {
                    resetWarnings(msg.key.remoteJid, senderJid);
                    try {
                      await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                      await sock.sendMessage(msg.key.remoteJid, {
                        text: `🔗🚫 @${senderJid.split('@')[0]} kicked after 3 warnings for sending links.`,
                        mentions: [senderJid],
                      });
                    } catch (e) {
                      logger.error(`[antilink] Failed to kick after warnings: ${e.message}`);
                    }
                  } else {
                    await sock.sendMessage(msg.key.remoteJid, {
                      text: `⚠️ Link deleted.\n*User:* @${senderJid.split('@')[0]}\n*Warn:* ${count}\n*Remaining:* ${3 - count}`,
                      mentions: [senderJid],
                    });
                  }
                }
              }
              continue;
            }
          }
        }

        if (msg.key.remoteJid.endsWith('@g.us')) {
          if (settingsStore.get('antibot', false)) {
            const botPrefixPattern = /^[.\/!#]/;
            if (botPrefixPattern.test(text) && !msg.key.fromMe) {
              const { isOwner } = require('../utils/isOwner');
              const { isSudo } = require('../utils/isSudo');
              const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
              const senderJid = msg.key.participant || msg.key.remoteJid;

              if (!isOwner(msg) && !isSudo(msg)) {
                const metadata = await sock.groupMetadata(msg.key.remoteJid);

                if (!isSenderAdmin(metadata, senderJid)) {
                  if (!isBotAdmin(sock, metadata)) {
                    await sock.sendMessage(msg.key.remoteJid, {
                      text: '⚠ *I need admin privileges to remove suspected cheap bots.*',
                    });
                    continue;
                  }

                  try {
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                    await sock.sendMessage(msg.key.remoteJid, {
                      text: `🤖 Bot detected @${senderJid.split('@')[0]}, kicked.`,
                      mentions: [senderJid],
                    });
                  } catch (e) {
                    logger.error(`[antibot] Failed to kick: ${e.message}`);
                  }
                  continue;
                }
              }
            }
          }
        }

        console.log('TEXT RECEIVED =', JSON.stringify(text));
        console.log('PREFIX =', JSON.stringify(prefix));
        console.log('STARTS WITH PREFIX =', text.startsWith(prefix));

        if (text.startsWith(prefix)) {
          await sock.sendMessage(msg.key.remoteJid, {
            react: {
              text: '🕷️',
              key: msg.key,
            },
          });
        }

        if (msg.key.remoteJid.endsWith('@g.us')) {
          if (settingsStore.get('antitag', false)) {
            const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const TAG_THRESHOLD = 5;

            if (mentionedJid.length > TAG_THRESHOLD) {
              const { isOwner } = require('../utils/isOwner');
              const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
              const senderJid = msg.key.participant || msg.key.remoteJid;

              if (!isOwner(msg)) {
                const metadata = await sock.groupMetadata(msg.key.remoteJid);

                if (!isSenderAdmin(metadata, senderJid)) {
                  if (!isBotAdmin(sock, metadata)) {
                    await sock.sendMessage(msg.key.remoteJid, {
                      text: '⚠️ *I need admin privileges to delete mass-tag spam.*',
                    });
                    continue;
                  }

                  try {
                    await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                    await sock.sendMessage(msg.key.remoteJid, {
                      text: `🏷️ Mass-tag message deleted from @${senderJid.split('@')[0]}.`,
                      mentions: [senderJid],
                    });
                  } catch (e) {
                    logger.error(`[antitag] Failed to delete: ${e.message}`);
                  }
                  continue;
                }
              }
            }
          }
        }

        if (msg.key.remoteJid.endsWith('@g.us')) {
          if (settingsStore.get('badword', false)) {
            const listPath = path.join(__dirname, '../config/badwords.json');
            const badwords = fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : [];

            const lowerText = text.toLowerCase();
            const matched = badwords.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lowerText));

            if (matched) {
              const { isOwner } = require('../utils/isOwner');
              const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
              const senderJid = msg.key.participant || msg.key.remoteJid;

              if (!isOwner(msg)) {
                const metadata = await sock.groupMetadata(msg.key.remoteJid);
                if (!isSenderAdmin(metadata, senderJid) && isBotAdmin(sock, metadata)) {
                  try {
                    await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                    await sock.sendMessage(msg.key.remoteJid, {
                      text: `🚫 @${senderJid.split('@')[0]} kicked for using bad words.`,
                      mentions: [senderJid],
                    });
                  } catch (e) {
                    logger.error(`[badword] Failed to delete/kick: ${e.message}`);
                  }
                  continue;
                }
              }
            }
          }
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
              await command.execute(sock, msg, args, commands, reply);
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

module.exports = { registerMessageHandler };
