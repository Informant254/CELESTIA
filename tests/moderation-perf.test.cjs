const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const warnings = require('../utils/warnings');
const sudo = require('../utils/isSudo');

const SUDO_PATH = path.join(__dirname, '..', 'config', 'sudoList.json');

test('warning strikes land instantly and survive a flush round-trip', () => {
  const scope = 'test-perf::unit';
  const user = '999@s.whatsapp.net';
  warnings.resetWarnings(scope, user);
  assert.equal(warnings.getWarnings(scope, user), 0);
  assert.equal(warnings.addWarning(scope, user), 1);
  assert.equal(warnings.addWarning(scope, user), 2);
  assert.equal(warnings.getWarnings(scope, user), 2);
  warnings.flush();
  assert.equal(warnings.getWarnings(scope, user), 2, 'cache coherent after flush');
  warnings.resetWarnings(scope, user);
  warnings.flush();
  assert.equal(warnings.getWarnings(scope, user), 0);
});

test('sudo list caches reads but add/remove stay exact', () => {
  const hadFile = fs.existsSync(SUDO_PATH);
  const original = hadFile ? fs.readFileSync(SUDO_PATH, 'utf8') : null;
  try {
    const fake = '999000111222';
    sudo.removeSudo(fake);
    assert.ok(!sudo.listSudo().includes(fake));
    sudo.addSudo(fake);
    assert.ok(sudo.listSudo().includes(fake), 'added number visible');
    assert.ok(sudo.listSudo().includes(fake), 'repeat reads agree (cache path)');
    sudo.removeSudo(fake);
    assert.ok(!sudo.listSudo().includes(fake), 'removed number gone');
  } finally {
    if (original === null) {
      if (fs.existsSync(SUDO_PATH)) fs.unlinkSync(SUDO_PATH);
    } else {
      fs.writeFileSync(SUDO_PATH, original);
    }
  }
});
