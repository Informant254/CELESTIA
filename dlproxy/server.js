/**
 * dlproxy/server.js — CELESTIA download proxy. Your own Apix.
 *
 *   GET /health
 *   GET /api/download/youtube/mp3?url=<youtube>&key=<client-key>  → audio/mpeg bytes
 *   GET /api/download/youtube/mp4?url=<youtube>&key=<client-key>  → video/mp4 bytes
 *   POST /admin/keys  { adminKey, action: issue|revoke|list, key?, label?, rpm?, rpd? }
 *
 * Env: PORT (default 3001), DLPROXY_ADMIN_KEY (required for /admin),
 *      DLPROXY_MAX_PARALLEL (default 3).
 * Client keys: dlproxy/keys.json (gitignored). Seed one on first boot via
 *      DLPROXY_SEED_KEY + DLPROXY_SEED_LABEL, or use /admin/keys.
 *
 * Run:  node dlproxy/server.js   (binds 127.0.0.1 — expose via Cloudflare Tunnel)
 */
const express = require('express');
const crypto = require('crypto');
const store = require('./keys');
const { fetchMedia, cleanup } = require('./fetch');

function createServer(opts = {}) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.disable('x-powered-by');

  const ADMIN_KEY = opts.adminKey || process.env.DLPROXY_ADMIN_KEY || '';
  const MAX_PARALLEL = Number(opts.maxParallel || process.env.DLPROXY_MAX_PARALLEL || 3);
  let inFlight = 0;

  const keys = store.load();
  if (!Object.keys(keys).length && process.env.DLPROXY_SEED_KEY) {
    store.issue(keys, process.env.DLPROXY_SEED_KEY, process.env.DLPROXY_SEED_LABEL || 'owner', 60, 2000);
    store.save(keys);
  }

  const fail = (res, code, error) => res.status(code).json({ success: false, error, provider: 'CELESTIA-DLPROXY' });

  app.get('/health', (req, res) => res.json({ ok: true, service: 'celestia-dlproxy', inFlight }));

  function auth(req) {
    const key = req.query.key || req.headers['x-api-key'] || '';
    const verdict = store.checkAndHit(keys, String(key));
    if (verdict.ok) {
      try { store.save(keys); } catch { /* accounting never breaks serving */ }
      return { ok: true };
    }
    return verdict;
  }

  app.get('/api/download/youtube/:kind', async (req, res) => {
    if (req.params.kind !== 'mp3' && req.params.kind !== 'mp4') {
      return fail(res, 404, 'kind must be mp3|mp4');
    }
    const a = auth(req);
    if (!a.ok) return fail(res, a.reason === 'Invalid API key.' ? 401 : 429, a.reason);
    const videoUrl = String(req.query.url || '');
    if (!/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(videoUrl)) {
      return fail(res, 400, 'url must be a YouTube watch/shorts/music link');
    }
    if (inFlight >= MAX_PARALLEL) return fail(res, 429, 'Proxy busy — retry in a few seconds.');
    inFlight += 1;
    try {
      const { file, dir } = await fetchMedia(req.params.kind, videoUrl);
      res.setHeader('Content-Type', req.params.kind === 'mp3' ? 'audio/mpeg' : 'video/mp4');
      res.sendFile(file, (err) => {
        cleanup(dir);
        if (err && !res.headersSent) fail(res, 500, 'send failed');
      });
    } catch (e) {
      fail(res, 502, String(e.message || 'fetch failed').slice(0, 200));
    } finally {
      inFlight -= 1;
    }
  });

  app.post('/admin/keys', (req, res) => {
    if (!ADMIN_KEY || req.body.adminKey !== ADMIN_KEY) return fail(res, 403, 'bad admin key');
    const { action, key, label, rpm, rpd } = req.body || {};
    if (action === 'list') {
      const view = {};
      for (const [k, v] of Object.entries(keys)) view[`${k.slice(0, 6)}…${k.slice(-4)}`] = { label: v.label, rpm: v.rpm, rpd: v.rpd, usedDay: v.usedDay };
      return res.json({ success: true, keys: view });
    }
    if (action === 'issue') {
      const k = key || `cel_${crypto.randomBytes(12).toString('hex')}`;
      const entry = store.issue(keys, k, label, rpm, rpd);
      store.save(keys);
      return res.json({ success: true, key: k, entry });
    }
    if (action === 'revoke') {
      const ok = store.revoke(keys, key);
      if (ok) store.save(keys);
      return res.json({ success: ok });
    }
    return fail(res, 400, 'action must be list|issue|revoke');
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3001);
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`[dlproxy] listening on 127.0.0.1:${port} — expose via Cloudflare Tunnel, never directly.`);
  });
}

module.exports = { createServer };
