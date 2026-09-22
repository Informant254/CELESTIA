const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const addsudo = require('../commands/addsudo');
const { listSudo } = require('../utils/isSudo');

const SUDO_FILE = path.join(__dirname, '..', 'config', 'sudoList.json');

function ownerMsg(ctx) {
  return {
    key: { remoteJid: '120363999999999999@g.us', fromMe: true, id: 'cmd' },
    message: { extendedTextMessage: { text: '.addsudo', contextInfo: ctx || {} } },
  };
}
function sock(sent) {
  return { async sendMessage(jid, content) { sent.push(content.text); } };
}

function withCleanSudo(fn) {
  const had = fs.existsSync(SUDO_FILE);
  const backup = had ? fs.readFileSync(SUDO_FILE, 'utf8') : null;
  fs.writeFileSync(SUDO_FILE, '[]'); // reset through the file so the mtime-guarded cache reloads
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (backup !== null) fs.writeFileSync(SUDO_FILE, backup);
      else if (fs.existsSync(SUDO_FILE)) fs.unlinkSync(SUDO_FILE);
    });
}

test('reply with LID-only participant resolves (participantPn absent)', async () => {
  await withCleanSudo(async () => {
    const sent = [];
    await addsudo.execute(sock(sent), ownerMsg({ participant: '7546811187317@lid', stanzaId: 'q' }), []);
    assert.ok(sent.some((t) => t.startsWith('✅')), 'success, got: ' + sent.join('|'));
    assert.ok(listSudo().includes('7546811187317'), 'LID stored');
  });
});

test('reply stores both PN and LID forms of the same person', async () => {
  await withCleanSudo(async () => {
    const sent = [];
    await addsudo.execute(sock(sent), ownerMsg({ participantPn: '254700000001@s.whatsapp.net', participant: '100000000000002@lid', stanzaId: 'q' }), []);
    const list = listSudo();
    assert.ok(list.includes('254700000001') && list.includes('100000000000002'), 'both forms stored: ' + list.join(','));
  });
});

test('tag resolves via mentionedJid', async () => {
  await withCleanSudo(async () => {
    const sent = [];
    await addsudo.execute(sock(sent), ownerMsg({ mentionedJid: ['254700000003@s.whatsapp.net'] }), ['@254700000003']);
    assert.ok(sent.some((t) => t.startsWith('✅')), 'success, got: ' + sent.join('|'));
    assert.ok(listSudo().includes('254700000003'), 'tagged number stored');
  });
});

test('typed number still works', async () => {
  await withCleanSudo(async () => {
    const sent = [];
    await addsudo.execute(sock(sent), ownerMsg({}), ['254700000004']);
    assert.ok(sent.some((t) => t.includes('254700000004')), 'success, got: ' + sent.join('|'));
  });
});

test('no target shows usage, not a crash', async () => {
  await withCleanSudo(async () => {
    const sent = [];
    await addsudo.execute(sock(sent), ownerMsg({}), []);
    assert.ok(sent.some((t) => t.includes('.addsudo @user')), 'usage shown, got: ' + sent.join('|'));
    assert.equal(listSudo().length, 0, 'nothing stored');
  });
});
