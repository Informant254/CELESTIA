const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

test('panel session replacements take effect without restarting and invalid files do not revive old credentials', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'instagram-session-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'instagram-cookie.txt');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/instagramSession.js'), 'utf8'), {
    module, exports: module.exports, require,
    process: { env: { INSTAGRAM_COOKIE_FILE: file, INSTAGRAM_COOKIE: 'sessionid=legacy' } },
  });
  assert.equal(module.exports.readCookie(), 'sessionid=legacy');
  fs.writeFileSync(file, 'sessionid=panel-first; csrftoken=csrf');
  assert.equal(module.exports.readCookie(), 'sessionid=panel-first; csrftoken=csrf');
  fs.writeFileSync(file, 'sessionid=panel-new; csrftoken=csrf');
  assert.equal(module.exports.readCookie(), 'sessionid=panel-new; csrftoken=csrf');
  fs.writeFileSync(file, '<html>not credentials</html>');
  assert.equal(module.exports.readCookie(), '');
  fs.writeFileSync(file, 'sessionid=bad\nheader');
  assert.equal(module.exports.readCookie(), '');
});
