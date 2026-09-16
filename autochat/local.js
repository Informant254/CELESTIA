/**
 * autochat/local.js — on-server LLM (no APIs, no quotas, fully hers).
 *
 * Lazy singleton: nothing downloads or loads until the first time the
 * cloud providers all fail. Model file (~800MB) bootstraps itself from
 * HuggingFace into autochat/models/ on first use.
 *
 * Engine: Llama-3.2-1B-Instruct Q4_K_M (~800MB RAM) — small enough for a
 * 2GB box, coherent enough for short banter. Dumber than Gemini/GLM, but
 * always awake. Kill switch: LOCAL_MODEL=off env, or .autochat local off.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const settingsStore = require('../utils/settingsStore');

const MODEL_DIR = path.join(__dirname, 'models');
const MODEL_FILE = 'Llama-3.2-1B-Instruct-Q4_K_M.gguf';
const MODEL_URL = `https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/${MODEL_FILE}`;

let sessionPromise = null; // in-flight init
let chatSession = null;
let queue = Promise.resolve(); // one inference at a time (RAM safety)

function enabled() {
  if (String(process.env.LOCAL_MODEL || '').toLowerCase() === 'off') return false;
  return settingsStore.get('local_model', true) !== false;
}

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CELESTIA-Bot/2.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return get(res.headers.location, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`model download HTTP ${res.statusCode}`));
      }
      const out = fs.createWriteStream(tmpPath());
      res.pipe(out);
      out.on('finish', () => resolve(true));
      out.on('error', reject);
      res.on('error', reject);
    }).on('error', reject);
  });
}

function modelPath() {
  return path.join(MODEL_DIR, MODEL_FILE);
}

function tmpPath() {
  return modelPath() + '.part';
}

async function ensureSession() {
  if (chatSession) return chatSession;
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
    if (!fs.existsSync(modelPath())) {
      console.log('[autochat] downloading local model (~800MB, one-time)...');
      await Promise.race([
        get(MODEL_URL),
        new Promise((_, reject) => setTimeout(() => reject(new Error('model download timed out')), 10 * 60 * 1000)),
      ]);
      fs.renameSync(tmpPath(), modelPath());
      console.log('[autochat] local model ready.');
    }
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath: modelPath() });
    const context = await model.createContext({ contextSize: 1536 });
    chatSession = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: 'You are a casual human texting on WhatsApp. Short replies.',
    });
    return chatSession;
  })();
  try {
    return await sessionPromise;
  } catch (e) {
    sessionPromise = null;
    try { if (fs.existsSync(tmpPath())) fs.unlinkSync(tmpPath()); } catch { /* ignore */ }
    throw e;
  }
}

// Serialize: one inference at a time, 120s cap each.
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// Small brains need small instructions: fixed mini-prompt, few-shot,
// low temperature. The big persona prompt makes 1B models loop.
function miniPrompt(user, savage) {
  const style = savage
    ? 'Slang ok (bro, fr, lol, lmao), light swearing ok (damn, shit). Examples: "spill it rn", "lol fr", "bet, im in", "deadass? no way".'
    : 'Casual and warm. Examples: "haha nice", "oh really?", "sounds good".';
  return `You are texting as a chill teenager on WhatsApp. Reply in 1-2 very short sentences. Never lecture, never repeat one word. ${style}\nFriend: ${user}\nYou:`;
}

async function generate(system, user) {
  if (!enabled()) return null;
  let savage = true;
  try {
    savage = require('../utils/settingsStore').get('autochat_vibe', 'savage') !== 'chill';
  } catch { /* default savage */ }
  try {
    return await enqueue(async () => {
      const session = await ensureSession();
      const answer = await Promise.race([
        session.prompt(miniPrompt(user, savage), { maxTokens: 80, temperature: 0.7 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('local timeout')), 120000)),
      ]);
      const text = String(answer || '').trim();
      return text || null;
    });
  } catch (e) {
    console.error('[autochat] local failed:', String(e.message).slice(0, 120));
    return null;
  }
}

function status() {
  return {
    enabled: enabled(),
    downloaded: fs.existsSync(modelPath()),
    loaded: !!chatSession,
    model: 'Llama-3.2-1B Q4_K_M',
  };
}

module.exports = { generate, status, enabled };
