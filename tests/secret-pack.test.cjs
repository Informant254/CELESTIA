const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const secrets = require('../utils/secrets');
const pack = require('../utils/secretPack').PACK;

// Baseline: every registered command name + alias EXCEPT the egg stubs.
function baselineNames() {
  const dir = path.join(__dirname, '..', 'commands');
  const names = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js') || f === 'eggs.js') continue;
    let mod;
    try { mod = require(path.join(dir, f)); } catch { continue; }
    for (const c of Array.isArray(mod) ? mod : [mod]) {
      if (!c || typeof c.name !== 'string') continue;
      names.add(c.name.trim().toLowerCase());
      for (const a of c.aliases || []) names.add(String(a).trim().toLowerCase());
    }
  }
  return names;
}

test('pack holds exactly 100 unique single-token triggers', () => {
  assert.equal(pack.length, 100);
  const triggers = pack.map((e) => e.t);
  assert.equal(new Set(triggers).size, 100, 'triggers unique');
  for (const t of triggers) {
    assert.match(t, /^[a-z0-9]{2,20}$/, `clean trigger: ${t}`);
  }
});

test('no egg shadows a real command (owner would lose the command)', () => {
  const taken = baselineNames();
  for (const name of secrets.eggNames()) {
    assert.ok(!taken.has(name), `collision: .${name} is a real command`);
  }
});

test('every egg resolves with a reward and a trigger-free hint', () => {
  assert.equal(secrets.eggNames().length, 108, '8 originals + 100 pack');
  for (const name of secrets.eggNames()) {
    const egg = secrets.findEgg(name);
    assert.ok(egg, `resolves: ${name}`);
    assert.ok(typeof egg.response === 'function' || typeof egg.response === 'string', `responds: ${name}`);
    assert.ok(egg.stars > 0 && egg.xp > 0, `bounty: ${name}`);
  }
  for (const e of pack) {
    assert.ok(e.h && e.h.length >= 10, `hint: ${e.t}`);
    assert.ok(!e.h.toLowerCase().includes(e.t), `hint leaks trigger: ${e.t}`);
    assert.ok(e.r && e.r.length >= 20, `response: ${e.t}`);
  }
});

test('randomHint only trails unfound eggs and gives up at 108/108', () => {
  const all = secrets.eggNames();
  const hint = secrets.randomHint(all.slice(0, 50));
  assert.ok(hint && hint.hint && hint.trigger, 'hint returned');
  assert.ok(!all.slice(0, 50).includes(hint.trigger), 'trails an unfound egg');
  assert.ok(!hint.hint.toLowerCase().includes(hint.trigger), 'riddle hides the trigger');
  assert.equal(secrets.randomHint(all), null, 'complete hunt = silence');
});

test('egg stubs register hidden and silent', () => {
  const stubs = require('../commands/eggs');
  assert.equal(stubs.length, 108, 'one stub per egg');
  for (const s of stubs) {
    assert.equal(s.hidden, true, `hidden: ${s.name}`);
    assert.equal(typeof s.execute, 'function', `executable: ${s.name}`);
  }
  const names = stubs.map((s) => s.name);
  assert.equal(new Set(names).size, 108, 'stubs unique');
});

test('menu hides secret stubs from the catalog', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'commands', 'menu.js'), 'utf8');
  assert.match(src, /command\?\.hidden/, 'menu filters hidden commands');
});
