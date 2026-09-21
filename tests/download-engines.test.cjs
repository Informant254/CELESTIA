const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expectedChecksum, sha256 } = require('../download/engines');

test('yt-dlp installer parses only the requested official checksum', () => {
  const hash = 'a'.repeat(64);
  const manifest = `${'b'.repeat(64)}  yt-dlp.exe\n${hash}  yt-dlp\n`;
  assert.equal(expectedChecksum(manifest, 'yt-dlp'), hash);
  assert.throws(() => expectedChecksum(manifest, 'yt-dlp_macos'), /does not contain/);
  assert.equal(sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
