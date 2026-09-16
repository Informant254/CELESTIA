/**
 * .vv — view-once reveal, CELESTIA build.
 *
 * Reply to a view-once photo/video/audio with .vv → she re-posts it
 * right here in chat, straight from RAM (zero disk I/O).
 *
 *   .vv                        → reveal quoted view-once (or show help)
 *   .vv caption set <text>     → custom caption (.vv caption set none = off)
 *   .vv caption default|show
 *   .vv info on|off sender|file|original
 *   .vv info status
 *   .vv settings
 *   .vv clean
 *   .vv auto on|off          → inbox auto-delivery master switch (default ON)
 *
 * Per-chat preferences persist in settingsStore.
 */
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const settingsStore = require('../utils/settingsStore');
const config = require('../config/config');

const BOT = config.botName || 'CELESTIA';

const CONFIG = {
  MAX_SIZE_MB: 50,
  DEFAULT_CAPTION: `*Retrieved by ${BOT}* ✨`,
  SHOW_SENDER_INFO: false,
  SHOW_FILE_INFO: false,
  SHOW_ORIGINAL_CAPTION: false,
};

const PREFS_KEY = 'vv_prefs';

function loadPrefs() {
  try {
    const data = settingsStore.get(PREFS_KEY, {});
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    settingsStore.set(PREFS_KEY, prefs);
  } catch (e) {
    console.error('[VV] prefs save failed:', e.message);
  }
}

function getChatPrefs(chatId) {
  const all = loadPrefs();
  if (!all[chatId]) {
    all[chatId] = {
      customCaption: CONFIG.DEFAULT_CAPTION,
      showSenderInfo: CONFIG.SHOW_SENDER_INFO,
      showFileInfo: CONFIG.SHOW_FILE_INFO,
      showOriginalCaption: CONFIG.SHOW_ORIGINAL_CAPTION,
    };
    savePrefs(all);
  }
  return all[chatId];
}

function setChatPrefs(chatId, prefs) {
  const all = loadPrefs();
  all[chatId] = prefs;
  savePrefs(all);
}

function isViewOnceMessage(message) {
  if (!message?.message) return false;
  if (message.message.imageMessage?.viewOnce) return true;
  if (message.message.videoMessage?.viewOnce) return true;
  if (message.message.audioMessage?.viewOnce) return true;
  if (message.message.viewOnceMessageV2) return true;
  if (message.message.viewOnceMessageV2Extension) return true;
  if (message.message.viewOnceMessage) return true;
  if (message.message.ephemeralMessage?.message?.viewOnceMessage) return true;
  return false;
}

function extractViewOnceMedia(message) {
  try {
    if (message.message?.imageMessage?.viewOnce) return { type: 'image', message: message.message.imageMessage };
    if (message.message?.videoMessage?.viewOnce) return { type: 'video', message: message.message.videoMessage };
    if (message.message?.audioMessage?.viewOnce) return { type: 'audio', message: message.message.audioMessage };

    let wrapped = null;
    if (message.message?.viewOnceMessageV2?.message) wrapped = message.message.viewOnceMessageV2.message;
    else if (message.message?.viewOnceMessageV2Extension?.message) wrapped = message.message.viewOnceMessageV2Extension.message;
    else if (message.message?.viewOnceMessage?.message) wrapped = message.message.viewOnceMessage.message;
    else if (message.message?.ephemeralMessage?.message?.viewOnceMessage?.message) wrapped = message.message.ephemeralMessage.message.viewOnceMessage.message;

    if (wrapped?.imageMessage) return { type: 'image', message: wrapped.imageMessage };
    if (wrapped?.videoMessage) return { type: 'video', message: wrapped.videoMessage };
    if (wrapped?.audioMessage) return { type: 'audio', message: wrapped.audioMessage };
  } catch (error) {
    console.error('[VV] extract failed:', error.message);
  }
  return null;
}

function getQuotedMessage(contextInfo) {
  if (!contextInfo) return null;
  return {
    key: {
      remoteJid: contextInfo.remoteJid,
      id: contextInfo.stanzaId,
      participant: contextInfo.participant,
      fromMe: contextInfo.fromMe,
    },
    message: contextInfo.quotedMessage,
  };
}

const box = (title, lines) => ['> ╭─❏ *' + title + '* ❏', ...lines.map((l) => '> │ ' + l), '> ╰─────────────────'].join('\n');

async function downloadAndSend(sock, message, mediaInfo, chatId, originalMsg) {
  console.log(`[VV] fetching ${mediaInfo.type} into RAM...`);
  const buffer = await downloadMediaMessage(
    message,
    'buffer',
    {},
    { logger: { level: 'silent' }, reuploadRequest: sock.updateMediaMessage }
  );

  if (!buffer || buffer.length === 0) throw new Error('Download failed: empty buffer');

  const sizeMB = buffer.length / (1024 * 1024);
  if (sizeMB > CONFIG.MAX_SIZE_MB) {
    throw new Error(`File too large: ${sizeMB.toFixed(2)}MB (max: ${CONFIG.MAX_SIZE_MB}MB)`);
  }
  console.log(`[VV] in memory (${(buffer.length / 1024).toFixed(0)} KB)`);

  const prefs = getChatPrefs(chatId);
  const caption = prefs.customCaption === 'none' ? '' : prefs.customCaption;

  const payload = {
    [mediaInfo.type]: buffer,
    ...(caption && { caption }),
    ...(mediaInfo.type === 'video' && { seconds: mediaInfo.message.seconds || 0 }),
    ...(mediaInfo.type === 'audio' && { mimetype: mediaInfo.message.mimetype || 'audio/mpeg' }),
  };

  const sent = await sock.sendMessage(chatId, payload, { quoted: originalMsg });
  console.log('[VV] dispatched.');
  return sent;
}

module.exports = {
  name: 'vv',
  description: '🔓 Reveal view-once media in chat — reply to it with .vv',
  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const send = (text) => sock.sendMessage(chatId, { text }, { quoted: msg });
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const sub = (args[0] || '').toLowerCase();

    // ─── subcommands (no quoted message needed) ───
    if (!quotedMsg || !contextInfo) {
      if (sub === 'clean' || sub === 'clear') {
        return send(box('CACHE CLEARED', ['RAM-only — no temp files are ever written to disk.']));
      }
      if (sub === 'auto') {
        const vault = require('../utils/viewonceVault');
        const mode = (args[1] || '').toLowerCase();
        if (mode === 'on' || mode === 'off') {
          vault.setAuto(mode === 'on');
          return send(box('AUTO-DELIVERY', [mode === 'on'
            ? 'ON — replies to view-once land open in your inbox.'
            : 'OFF — she will not touch view-once media.']));
        }
        return send(box('AUTO-DELIVERY', [`Currently *${vault.isAutoOn() ? 'ON' : 'OFF'}*`, '`.vv auto on|off`']));
      }
      if (sub === 'caption') {
        const action = (args[1] || '').toLowerCase();
        const prefs = getChatPrefs(chatId);
        if (action === 'set') {
          const text = args.slice(2).join(' ').trim();
          if (!text) return send(box('VV CAPTION', ['*.vv caption set <text>* — custom caption', '*.vv caption set none* — disable']));
          prefs.customCaption = text === 'none' ? 'none' : text;
          setChatPrefs(chatId, prefs);
          return send(box('CAPTION UPDATED', [text === 'none' ? 'Disabled.' : `"${text}"`]));
        }
        if (action === 'default') {
          prefs.customCaption = CONFIG.DEFAULT_CAPTION;
          setChatPrefs(chatId, prefs);
          return send(box('CAPTION RESET', [`"${CONFIG.DEFAULT_CAPTION}"`]));
        }
        if (action === 'show') {
          const cur = prefs.customCaption === 'none' ? 'Disabled.' : `"${prefs.customCaption}"`;
          return send(box('VV CAPTION', [`*Current:* ${cur}`, `*Default:* "${CONFIG.DEFAULT_CAPTION}"`]));
        }
        return send(box('VV CAPTION', ['*.vv caption set <text>*', '*.vv caption default*', '*.vv caption show*']));
      }
      if (sub === 'info') {
        const action = (args[1] || '').toLowerCase();
        const prefs = getChatPrefs(chatId);
        if (action === 'on' || action === 'off') {
          const on = action === 'on';
          const type = (args[2] || '').toLowerCase();
          if (type === 'sender') prefs.showSenderInfo = on;
          else if (type === 'file') prefs.showFileInfo = on;
          else if (type === 'original') prefs.showOriginalCaption = on;
          else return send(box('VV INFO', ['*.vv info on/off sender*', '*.vv info on/off file*', '*.vv info on/off original*']));
          setChatPrefs(chatId, prefs);
          return send(box('INFO UPDATED', [`${type} → ${on ? 'ON' : 'OFF'}`]));
        }
        if (action === 'status') {
          const f = (v) => (v ? 'ON' : 'OFF');
          return send(box('VV INFO STATUS', [`*Sender:* ${f(prefs.showSenderInfo)}`, `*File:* ${f(prefs.showFileInfo)}`, `*Original:* ${f(prefs.showOriginalCaption)}`]));
        }
        return send(box('VV INFO', ['*.vv info on/off sender|file|original*', '*.vv info status*']));
      }
      if (sub === 'settings' || sub === 'prefs') {
        const prefs = getChatPrefs(chatId);
        const f = (v) => (v ? 'ON' : 'OFF');
        return send(box('VV SETTINGS', [
          `*Caption:* ${prefs.customCaption === 'none' ? 'Disabled.' : `"${prefs.customCaption}"`}`,
          `*Sender:* ${f(prefs.showSenderInfo)} · *File:* ${f(prefs.showFileInfo)} · *Original:* ${f(prefs.showOriginalCaption)}`,
        ]));
      }
      if (sub === 'help') {
        return send(box('VIEW-ONCE', [
          'Reply to view-once with ```VV```',
          '```VV CAPTION ...``` — manage caption',
          '```VV INFO ...``` — toggle info display',
          '```VV SETTINGS``` — view settings',
          '```VV AUTO ON|OFF``` — inbox delivery switch',
        ]));
      }
      return send(box('VIEW-ONCE', [
        'Reply to a view-once photo/video/audio with ```VV```',
        '```VV HELP``` — all options',
      ]));
    }

    // ─── reveal flow ───
    const quotedMessage = getQuotedMessage(contextInfo);
    if (!quotedMessage) return send('❌ Could not retrieve the quoted message.');
    if (!isViewOnceMessage(quotedMessage)) {
      return send('❌ Not a view-once message. Reply to a view-once photo, video, or audio.');
    }
    const mediaInfo = extractViewOnceMedia(quotedMessage);
    if (!mediaInfo) return send('❌ Could not extract media from the view-once message.');

    try {
      await downloadAndSend(sock, quotedMessage, mediaInfo, chatId, msg);
    } catch (error) {
      console.error('[VV] reveal failed:', error.message);
      await send(box('DOWNLOAD FAILED', [String(error.message).slice(0, 120)]));
    }
  },
};
