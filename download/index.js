/**
 * download/index.js — orchestrates search → select → quality → download → send.
 *
 * Flow: command (name/URL) -> results -> number -> quality -> number -> job.
 * Queue (max 2) -> yt-dlp primary -> API-direct tertiary -> send -> cleanup.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cfg = require('./config');
const sessions = require('./sessions');
const queue = require('./queue');
const { search } = require('./search');
const { QUALITY_MENU, byNumber } = require('./formats');
const ytdlp = require('./ytdlp');
const ffmpeg = require('./ffmpeg');
const { jobDir, wipeDir } = require('./cleanup');
const { log, senderTag, classify, userMessage } = require('./errors');

// Sweep stale tmp job dirs at boot (module loads once per process).
try { require('./cleanup').sweepStale(); } catch { /* tmp may not exist yet */ }

const URL_RE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/\S+/i;

function fmtResults(query, results) {
  const L = ['╭─「 CELESTIA SEARCH 」─╮', '│', `│ 🔎 ${query}`, '│'];
  results.forEach((r, i) => {
    L.push(`│ ${['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][i]} ${r.title.slice(0, 70)}`);
    L.push(`│    📺 ${String(r.channel).slice(0, 30)} · ⏱ ${r.durationText}`);
    L.push('│');
  });
  L.push('╰─────────────────────╯', '', '_Reply with 1-5 to download._');
  return L.join('\n');
}

function fmtQuality(title) {
  const L = ['╭─「 QUALITY 」─╮', '│', `│ 🎬 ${String(title).slice(0, 60)}`, '│'];
  for (const q of QUALITY_MENU) L.push(`│ ${['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'][q.n - 1]} ${q.label}`);
  L.push('│', '╰──────────────╯', '', '_Reply with 1-6._');
  return L.join('\n');
}

function bar(frac) {
  const filled = Math.round(frac * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${Math.round(frac * 100)}%`;
}

// ─── entry: .video/.play/.song/.audio/.music <name|url> ─────────────────────
async function handleSearchCommand(sock, msg, kind, rawQuery) {
  const chatId = msg.key.remoteJid;
  const senderId = msg.key.participant || msg.key.remoteJid;
  const tag = senderTag(chatId, senderId);
  const query = String(rawQuery || '').trim();

  if (!query) {
    const ex = { video: '.video Shape of You', audio: '.play Eminem Mockingbird' }[kind] || '.play <name>';
    return sock.sendMessage(chatId, { text: `🔎 Usage: \`${ex}\`` }, { quoted: msg });
  }

  // URL fallback: skip search, straight to quality choice.
  if (URL_RE.test(query)) {
    const s = sessions.create({
      chatId, senderId, kind, query,
      results: [{ id: null, url: query, title: 'Direct link', channel: 'YouTube', duration: null, durationText: '—' }],
      statusKey: null,
    });
    s.picked = s.results[0];
    s.stage = 'quality';
    log('url-direct', { tag, kind });
    return sock.sendMessage(chatId, { text: fmtQuality(s.picked.title) }, { quoted: msg });
  }

  const searching = await sock.sendMessage(chatId, { text: `🔎 Searching for:\n\n*${query.slice(0, 100)}*` }, { quoted: msg });
  try {
    const results = await search(query, tag);
    sessions.create({ chatId, senderId, kind, query, results, statusKey: null });
    await sock.sendMessage(chatId, { text: '⏳ Found result.', edit: searching.key });
    return sock.sendMessage(chatId, { text: fmtResults(query.slice(0, 80), results) }, { quoted: msg });
  } catch (e) {
    log('search-fail', { tag, kind, err: classify(e) });
    return sock.sendMessage(chatId, { text: userMessage(e, 'SEARCH FAILED'), edit: searching.key });
  }
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
    const max = res.session.stage === 'quality' ? 6 : res.session.results.length;
    await sock.sendMessage(chatId, { text: `❌ Pick a number 1-${max}.` }, { quoted: msg });
    return true;
  }
  if (res.pick) {
    log('select-result', { tag, kind: res.session.kind, title: res.pick.title.slice(0, 60) });
    await sock.sendMessage(chatId, { text: fmtQuality(res.pick.title) }, { quoted: msg });
    return true;
  }
  if (res.quality) {
    const q = byNumber(res.quality);
    const s = res.session;
    sessions.drop(chatId, senderId);
    log('select-quality', { tag, kind: s.kind, quality: q.label, title: s.picked.title.slice(0, 60) });
    runJob(sock, msg, s, q).catch((e) => console.error('[DL] job crash:', e.message));
    return true;
  }
  return false;
}

// ─── the download job (queued, guarded, always cleaned up) ──────────────────
async function runJob(sock, msg, session, quality) {
  const chatId = msg.key.remoteJid;
  const senderId = msg.key.participant || msg.key.remoteJid;
  const tag = senderTag(chatId, senderId);
  const dir = jobDir(session.kind);
  const t0 = Date.now();
  const isAudio = quality.kind === 'audio' || session.kind === 'audio';
  const maxBytes = isAudio ? cfg.MAX_AUDIO_BYTES : cfg.MAX_VIDEO_BYTES;

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
      setStatus(`⬇️ Downloading...\n\n${bar(frac)}`).catch(() => {});
    };

    try {
      await setStatus('⬇️ Downloading...');
      let file, size, engine = 'yt-dlp';
      try {
        const r = await ytdlp.download({ url: session.picked.url, quality, workDir: dir, onProgress, maxBytes });
        file = r.file; size = r.size;
        log('engine', { tag, engine, attempt: r.attempt, selector: r.selector });
      } catch (e1) {
        // Tertiary: direct HTTP of an API-resolved URL (one attempt, classified).
        const cat = classify(e1);
        if (cat === 'restricted' || cat === 'ffmpeg-missing') throw e1;
        log('fallback-api', { tag, reason: cat });
        const api = require('../utils/downloader');
        const r = isAudio
          ? await api.ytAudio(session.picked.url, session.picked.title)
          : await api.ytVideo(session.picked.url, session.picked.title);
        const dl = await axios.get(r.url, { responseType: 'arraybuffer', timeout: 120000 });
        const buf = Buffer.from(dl.data);
        if (!buf.length) throw new Error('Fallback download was empty.');
        const ext = isAudio ? '.mp3' : '.mp4';
        file = path.join(dir, 'out' + ext);
        fs.writeFileSync(file, buf);
        size = buf.length;
        engine = 'api-direct';
      }

      await setStatus('⚙️ Processing...');
      let sendFile = file;
      if (isAudio && !/\.mp3$/i.test(file)) {
        const out = path.join(dir, 'out.mp3');
        await ffmpeg.toMp3(file, out);
        sendFile = out;
      } else if (!isAudio) {
        // Phones + WhatsApp only play H.264/AAC faststart MP4 — normalize.
        sendFile = await ffmpeg.normalizeForWhatsApp(file, dir);
      } else {
        await ffmpeg.probe(file).catch(() => null);
      }
      size = fs.statSync(sendFile).size;

      if (size > maxBytes) {
        const err = new Error(`File is ${(size / 1048576).toFixed(0)}MB — over the ${(maxBytes / 1048576).toFixed(0)}MB limit.`);
        err.userDetail = `File is too large (${(size / 1048576).toFixed(0)}MB) — try Audio or a shorter video.`;
        throw err;
      }

      await setStatus('📤 Uploading...');
      const title = session.picked.title;
      const buf = fs.readFileSync(sendFile);
      if (isAudio) {
        const fileName = title.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) + '.mp3';
        await sock.sendMessage(chatId, { audio: buf, mimetype: 'audio/mpeg', fileName, ptt: false }, { quoted: msg });
        await sock.sendMessage(chatId, { document: buf, mimetype: 'audio/mpeg', fileName }, { quoted: msg });
      } else {
        const fileName = title.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) + '.mp4';
        await sock.sendMessage(chatId, { video: buf, mimetype: 'video/mp4', fileName, caption: `🎬 *${title}*` }, { quoted: msg });
      }

      await setStatus('✨ Done.');
      log('success', { tag, kind: session.kind, quality: quality.label, engine, secs: Math.round((Date.now() - t0) / 1000), bytes: size });
    } catch (e) {
      log('fail', { tag, kind: session.kind, quality: quality.label, err: classify(e), secs: Math.round((Date.now() - t0) / 1000) });
      const txt = userMessage(e);
      try {
        if (statusMsg) await sock.sendMessage(chatId, { text: txt, edit: statusMsg.key });
        else await sock.sendMessage(chatId, { text: txt }, { quoted: msg });
      } catch { /* last resort failed */ }
    } finally {
      wipeDir(dir); // guaranteed cleanup, success or failure
    }
  });
}

module.exports = { handleSearchCommand, handleSelection, runJob, fmtResults, fmtQuality };
