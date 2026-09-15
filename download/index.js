/**
 * download/index.js — SILENT SMART FALLBACK orchestrator.
 *
 * User sees: searching -> results -> (picks number) -> sending -> media -> done.
 * Everything else (strategies, formats, results, FFmpeg, network) stays in logs.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const sessions = require('./sessions');
const queue = require('./queue');
const { search } = require('./search');
const { byNumber } = require('./formats');
const ytdlp = require('./ytdlp');
const ffmpeg = require('./ffmpeg');
const fallback = require('./fallback');
const { jobDir, wipeDir } = require('./cleanup');
const { classify } = require('./errors');
const { senderTag } = require('./errors');
const logger = require('./logger');

const URL_RE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/\S+/i;
const QTOK = { best: 1, '1080': 2, '1080p': 2, '720': 3, '720p': 3, '480': 4, '480p': 4, '360': 5, '360p': 5, audio: 6, mp3: 6 };

// Optional quality hint: ".video 720p <name>" or ".video <name> 720p".
function parseQuality(raw, kind) {
  let q = kind === 'audio' ? 6 : 1;
  let text = String(raw || '').trim();
  const m = text.match(/(^|\s)(best|1080p?|720p?|480p?|360p?|audio|mp3)(\s|$)/i);
  if (m && kind === 'video') {
    q = QTOK[m[2].toLowerCase()] || 1;
    text = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  }
  return { quality: byNumber(q) || byNumber(1), query: text };
}

function fmtResults(query, results) {
  const L = ['> ╭─❏ *SEARCH RESULTS* ❏', `> │ 🔎 ${query}`, '> │'];
  results.forEach((r, i) => {
    L.push(`> │ ${['1️⃣', '2️⃣', '3️⃣'][i]} ${r.title.slice(0, 60)}`);
    // meta line shows only what we actually know — never "Unknown · —"
    const meta = [];
    if (r.channel) meta.push(`📺 ${String(r.channel).slice(0, 28)}`);
    if (r.durationText && r.durationText !== '—') meta.push(`⏱ ${r.durationText}`);
    if (meta.length) L.push(`> │ ${meta.join(' · ')}`);
    L.push('> │');
  });
  L.push('> ╰─────────────────', '', '_Reply with 1-3 to download._');
  return L.join('\n');
}

// ─── entry: .video/.play/.song/.audio/.music <name|url> ─────────────────────
async function handleSearchCommand(sock, msg, kind, rawQuery) {
  const chatId = msg.key.remoteJid;
  const senderId = msg.key.participant || msg.key.remoteJid;
  const tag = senderTag(chatId, senderId);
  const { quality, query } = parseQuality(rawQuery, kind);
  logger.celestia({ tag, query: query.slice(0, 80), kind });

  if (!query) {
    const ex = kind === 'video' ? '.video Shape of You' : '.play Eminem Mockingbird';
    return sock.sendMessage(chatId, { text: `🔎 Usage: \`${ex}\`` }, { quoted: msg });
  }

  // URL fallback: no search needed — straight to the silent pipeline.
  if (URL_RE.test(query)) {
    const snap = {
      chatId, senderId, kind, query, quality,
      results: [{ id: null, url: query, title: 'Direct link', channel: 'YouTube', duration: null, durationText: '—' }],
      picked: null,
    };
    snap.picked = snap.results[0];
    runJob(sock, msg, snap).catch((e) => logger.celestia({ tag, err: String(e.message).slice(0, 80) }));
    return;
  }

  const searching = await sock.sendMessage(chatId, { text: `🔎 Searching for: ${query.slice(0, 100)}` }, { quoted: msg });
  try {
    const results = await search(query, tag);
    // Obvious pick? Download it silently. Genuinely ambiguous? Ask.
    if (!fallback.isAmbiguous(query, results)) {
      const snap = { chatId, senderId, kind, query, quality, results, picked: results[0] };
      logger.select({ tag, auto: true, title: results[0].title.slice(0, 60) });
      await sock.sendMessage(chatId, { text: `✅ ${results[0].title.slice(0, 80)}\n📥 Sending...` }, { quoted: msg });
      runJob(sock, msg, snap).catch((e) => logger.celestia({ tag, err: String(e.message).slice(0, 80) }));
      return;
    }
    sessions.create({ chatId, senderId, kind, query, quality, results });
    await sock.sendMessage(chatId, { text: fmtResults(query.slice(0, 80), results) }, { quoted: msg });
    try { await sock.sendMessage(chatId, { text: '🔎 Searching: done.', edit: searching.key }); } catch { /* cosmetic */ }
  } catch (e) {
    logger.search({ tag, status: 'failed', reason: classify(e) });
    await sock.sendMessage(chatId, { text: userFail(), edit: searching.key });
  }
}

function userFail() {
  return "❌ I couldn't download that media right now.\n\nTry another title or try again later.";
}

// ─── entry: bare-number reply. true = handled (message is ours). ────────────
async function handleSelection(sock, msg, text) {
  const chatId = msg.key.remoteJid;
  const senderId = msg.key.participant || msg.key.remoteJid;
  if (!/^\d{1,2}$/.test(String(text || '').trim())) return false;

  const res = sessions.resolve(chatId, senderId, text);
  if (!res) return false; // no session — not our message
  if (res.expired) {
    await sock.sendMessage(chatId, { text: '⌛ Search expired — send a new search.' }, { quoted: msg });
    return true;
  }
  const tag = senderTag(chatId, senderId);
  if (res.invalid) {
    await sock.sendMessage(chatId, { text: `❌ Pick a number 1-${res.session.results.length}.` }, { quoted: msg });
    return true;
  }
  if (res.pick) {
    logger.select({ tag, result: res.pick.title.slice(0, 60) });
    const s = res.session;
    sessions.drop(chatId, senderId); // single-shot: a pick can never fire twice
    const snap = { chatId, senderId, kind: s.kind, query: s.query, quality: s.quality, results: s.results, picked: res.pick };
    await sock.sendMessage(chatId, { text: `✅ ${res.pick.title.slice(0, 80)}\n📥 Sending...` }, { quoted: msg });
    runJob(sock, msg, snap).catch((e) => logger.celestia({ tag, err: String(e.message).slice(0, 80) }));
    return true;
  }
  return false;
}

// ─── the silent job: queue -> fallback loop -> validate -> send -> cleanup ───
async function runJob(sock, msg, snap) {
  const chatId = msg.key.remoteJid;
  const senderId = snap.senderId || msg.key.participant || msg.key.remoteJid;
  const tag = senderTag(chatId, senderId);
  const dir = jobDir(snap.kind);
  const t0 = Date.now();
  const isAudio = snap.kind === 'audio' || (snap.quality && snap.quality.kind === 'audio');
  const maxBytes = isAudio ? cfg.MAX_AUDIO_BYTES : cfg.MAX_VIDEO_BYTES;
  let timeoutHandle = null;

  const onTimeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      ytdlp.abortDir(dir);
      reject(new Error('Overall request timeout exceeded (TIMEOUT).'));
    }, cfg.DOWNLOAD_TIMEOUT_MS);
    if (timeoutHandle.unref) timeoutHandle.unref();
  });

  const job = (async () => {
    const st = queue.stats();
    let statusMsg = null;
    if (st.active >= st.max) {
      statusMsg = await sock.sendMessage(chatId, { text: `⏳ You are #${st.waiting + 1} in the download queue.` }, { quoted: msg });
    }

    await queue.run(async () => {
      const setStatus = async (t) => {
        try {
          if (statusMsg) await sock.sendMessage(chatId, { text: t, edit: statusMsg.key });
          else statusMsg = await sock.sendMessage(chatId, { text: t }, { quoted: msg });
        } catch { /* cosmetic */ }
      };
      let lastEdit = 0;
      const onProgress = (frac) => {
        const now = Date.now();
        if (now - lastEdit < 4000) return;
        lastEdit = now;
        const filled = Math.round(frac * 10);
        setStatus(`⬇️ Downloading...\n\n${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${Math.round(frac * 100)}%`).catch(() => {});
      };

      // result fallback loop: selected result -> next RELEVANT result
      const tried = new Set();
      let current = snap.picked;
      let final = null;
      let used = current;
      for (let r = 0; ; r++) {
        tried.add(current.url);
        try {
          final = await fallback.downloadWithFallback({
            url: current.url, title: current.title, quality: snap.quality,
            isAudio, workDir: dir, onProgress, maxBytes, tag,
          });
          used = current;
          break;
        } catch (e) {
          const cat = classify(e);
          if (cat === 'FILE_TOO_LARGE' || cat === 'DEPENDENCY_MISSING') throw e;
          if (r >= cfg.MAX_RESULT_FALLBACKS) throw e;
          const next = fallback.bestRelevant(snap.query, snap.results, tried, 1)[0];
          if (!next) throw e;
          logger.fallback({ tag, strategy: 'result-fallback', title: next.title.slice(0, 60) });
          current = next;
        }
      }

      await setStatus('⚙️ Processing...');
      let sendFile = final.file;
      if (isAudio && !/\.mp3$/i.test(final.file)) {
        sendFile = await ffmpeg.toMp3(final.file, path.join(dir, 'out.mp3'));
      } else if (!isAudio) {
        sendFile = await ffmpeg.normalizeForWhatsApp(final.file, dir);
      }
      const size = fs.statSync(sendFile).size;
      if (size > maxBytes) {
        const err = new Error(`File is ${(size / 1048576).toFixed(0)}MB — over the ${(maxBytes / 1048576).toFixed(0)}MB limit.`);
        err.userDetail = `That file is too large (${(size / 1048576).toFixed(0)}MB) — try Audio or a shorter video.`;
        throw err;
      }

      await setStatus('📤 Uploading...');
      const buf = fs.readFileSync(sendFile);
      const clean = String(used.title).replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80);
      // send with one retry on the SAME buffer — never redownload for upload failures
      const sendOnce = () => isAudio
        ? sock.sendMessage(chatId, { audio: buf, mimetype: 'audio/mpeg', fileName: clean + '.mp3', ptt: false }, { quoted: msg })
        : sock.sendMessage(chatId, { video: buf, mimetype: 'video/mp4', fileName: clean + '.mp4', caption: `🎬 *${used.title}*` }, { quoted: msg });
      try {
        await sendOnce();
        logger.upload({ tag, status: 'success' });
      } catch (e1) {
        logger.upload({ tag, status: 'retry', reason: String(e1.message).slice(0, 80) });
        await new Promise((rr) => setTimeout(rr, 3000));
        await sendOnce();
        logger.upload({ tag, status: 'success-retry' });
      }
      if (isAudio) {
        try {
          await sock.sendMessage(chatId, { document: buf, mimetype: 'audio/mpeg', fileName: clean + '.mp3' }, { quoted: msg });
        } catch { /* document is a bonus — audio already delivered */ }
      }

      await setStatus('✨ Done.');
      logger.celestia({ tag, status: 'done', secs: Math.round((Date.now() - t0) / 1000), bytes: size });
    });
  })();

  try {
    await Promise.race([job, onTimeout]);
  } catch (e) {
    const { userMessage } = require('./errors');
    logger.celestia({ tag, status: 'failed', reason: classify(e) });
    try {
      await sock.sendMessage(chatId, { text: userMessage(e) }, { quoted: msg });
    } catch { /* last resort failed */ }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    wipeDir(dir); // guaranteed cleanup, success or failure
    logger.cleanup({ tag, status: 'success' });
  }
}

module.exports = { handleSearchCommand, handleSelection, runJob, fmtResults, parseQuality };
