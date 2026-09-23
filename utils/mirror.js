/**
 * utils/mirror.js — 🪞 MIRROR NETWORK shared core.
 *
 * Links every CELESTIA into one fleet with the operator bot as master.
 * Transport is WhatsApp DMs between the bots themselves — no servers,
 * no ports, no new infrastructure.
 *
 *   Master → agent DM : `!m <command text>`          (envelope)
 *   Agent  → master DM: `\u200BMIRROR-RES <output>`  (result marker, invisible)
 *
 * SECURITY:
 *   - Agent obeys ONLY its linked master number (server-attested sender JID,
 *     PN- and LID-aware). Nothing else can trigger it.
 *   - Agent executes ONLY whitelisted read-only commands (no shell, no eval,
 *     no session/config writes, no pairing).
 *   - Master relays ONLY its own owner's requests (isOwner gate in command).
 */
const settingsStore = require('./settingsStore');

const MASTER_KEY = 'mirror_master'; // digits string of the linked master number (agent side)
const AGENT_ON_KEY = 'mirror_agent_on';
const BOTS_KEY = 'mirror_bots'; // [digits, ...] linked fleet (master side)

// Read-only, safe to run remotely. NEVER add: eval, shell, pair, session,
// setkey, config/env writers, restart, update, logout.
const AGENT_WHITELIST = new Set(['ping', 'alive', 'uptime', 'runtime', 'status', 'menu']);

const ENVELOPE_PREFIX = '!m ';
const RES_MARKER = '\u200BMIRROR-RES ';
const RES_TIMEOUT_MS = 20000;

function digits(v) {
  return String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

// Every JID form the sender could present (PN + LID, group + DM).
function senderDigits(msg) {
  const out = new Set();
  const push = (v) => { const d = digits(v); if (d) out.add(d); };
  push(msg.key?.participantPn);
  push(msg.key?.participantAlt);
  push(msg.key?.participant);
  push(msg.key?.remoteJidAlt);
  push(msg.key?.remoteJid);
  return [...out];
}

function isMasterSender(msg, masterDigits) {
  if (!masterDigits) return false;
  const want = String(masterDigits);
  for (const d of senderDigits(msg)) {
    if (d === want) return true;
    const mapped = idMap()[d];
    if (mapped === want) return true;
  }
  return false;
}

// ── LID↔PN contact map ──
// Fleet DMs often arrive LID-addressed while we store phone numbers.
// Learn both directions from live traffic so either form matches.
const IDS_KEY = 'mirror_ids';

function idMap() {
  const v = settingsStore.get(IDS_KEY, {});
  return v && typeof v === 'object' ? v : {};
}

function noteContact(msg) {
  try {
    const a = digits(msg.key?.remoteJidAlt);
    const b = digits(msg.key?.remoteJid);
    const p = digits(msg.key?.participant);
    if (a && b && a !== b) {
      const m = idMap();
      if (m[a] !== b || m[b] !== a) {
        m[a] = b;
        m[b] = a;
        settingsStore.set(IDS_KEY, m);
      }
    }
    if (p && b && p !== b && msg.key?.remoteJid?.endsWith('@g.us')) {
      const m = idMap();
      if (m[p] !== b || m[b] !== p) {
        m[p] = b;
        m[b] = p;
        settingsStore.set(IDS_KEY, m);
      }
    }
  } catch { /* learning never breaks chat */ }
}

function matchesFleet(msg) {
  const fleet = fleetBots();
  if (!fleet.length) return null;
  const m = idMap();
  for (const d of senderDigits(msg)) {
    if (fleet.includes(d)) return d;
    if (m[d] && fleet.includes(m[d])) return m[d];
  }
  return null;
}

// Execute a master's envelope on the agent side. Returns true when consumed.
// Runs ONLY whitelisted commands with output captured back to the master DM.
async function runAgentCommand(sock, msg, commands, prefix = '.') {
  const inner = parseEnvelope(extractText(msg));
  if (inner === null) return false;
  const parts = inner.trim().split(/\s+/);
  let name = (parts.shift() || '').toLowerCase();
  if (name.startsWith(prefix)) name = name.slice(prefix.length);
  if (!name) return true;
  const cmd = commands.get(name);
  if (!cmd || !AGENT_WHITELIST.has(cmd.name)) {
    await sock.sendMessage(msg.key.remoteJid, { text: buildResult(`❌ Not available remotely: ${name}`) }, { quoted: msg }).catch(() => {});
    return true;
  }
  const out = [];
  const capture = async (content) => {
    if (typeof content === 'string') out.push(content);
    else if (content && typeof content.text === 'string') out.push(content.text);
    else { try { out.push(JSON.stringify(content).slice(0, 500)); } catch { /* ignore */ } }
  };
  const fakeSock = Object.assign(Object.create(Object.getPrototypeOf(sock)), sock, {
    sendMessage: async (j, c) => { await capture(c); return { key: { id: 'mirror' } }; },
  });
  const reply = async (c) => capture(c);
  try {
    await cmd.execute(fakeSock, msg, parts, commands, reply);
  } catch (e) {
    out.push(`❌ ${String(e.message || e).slice(0, 140)}`);
  }
  const body = out.filter(Boolean).join('\n\n').trim() || '(no output)';
  await sock.sendMessage(msg.key.remoteJid, { text: buildResult(body) }, { quoted: msg }).catch(() => {});
  return true;
}

function extractText(msg) {
  const m = msg.message || {};
  return m.conversation || m.extendedTextMessage?.text || '';
}
const pending = new Map(); // botDigits -> [{ resolve, timer }]

function awaitReply(botDigits, ms = RES_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const entry = { resolve, timer: null };
    entry.timer = setTimeout(() => {
      drop(entry, botDigits);
      resolve(null);
    }, ms);
    if (!pending.has(botDigits)) pending.set(botDigits, []);
    pending.get(botDigits).push(entry);
  });
}

function drop(entry, botDigits) {
  const list = pending.get(botDigits) || [];
  const i = list.indexOf(entry);
  if (i >= 0) list.splice(i, 1);
  if (!list.length) pending.delete(botDigits);
  else pending.set(botDigits, list);
}

function feedResult(botDigits, text) {
  const list = pending.get(botDigits) || [];
  pending.delete(botDigits);
  for (const entry of list) {
    clearTimeout(entry.timer);
    entry.resolve(text);
  }
  return list.length;
}

function parseEnvelope(text) {
  const t = String(text || '');
  if (!t.startsWith(ENVELOPE_PREFIX)) return null;
  return t.slice(ENVELOPE_PREFIX.length).trim();
}

function parseResult(text) {
  const t = String(text || '');
  if (!t.startsWith(RES_MARKER)) return null;
  return t.slice(RES_MARKER.length);
}

function buildResult(output) {
  return RES_MARKER + String(output || '').slice(0, 1500);
}

function getMaster() {
  return settingsStore.get(MASTER_KEY, null);
}

function agentOn() {
  return settingsStore.get(AGENT_ON_KEY, false) === true;
}

function fleetBots() {
  const v = settingsStore.get(BOTS_KEY, []);
  return Array.isArray(v) ? v : [];
}

module.exports = {
  MASTER_KEY, AGENT_ON_KEY, BOTS_KEY, IDS_KEY, AGENT_WHITELIST,
  ENVELOPE_PREFIX, RES_MARKER, RES_TIMEOUT_MS,
  digits, senderDigits, isMasterSender,
  parseEnvelope, parseResult, buildResult,
  getMaster, agentOn, fleetBots,
  idMap, noteContact, matchesFleet,
  awaitReply, feedResult, runAgentCommand, extractText,
};
