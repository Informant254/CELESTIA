const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { ensureFfmpegPath, ensureFfprobePath, runOnce } = require('../download/engines');
const { prepareStatusAudio } = require('../utils/groupStatusAudio');

test('downloaded MP3 becomes decodable mono Opus, with long songs capped and short songs preserved', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'celestia-audio-test-'));
  try {
    const ffmpeg = await ensureFfmpegPath();
    const ffprobe = await ensureFfprobePath();
    for (const seconds of [2, 245]) {
      const source = path.join(dir, 'download.mp3');
      await runOnce(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
        '-i', 'sine=frequency=440:sample_rate=44100', '-t', String(seconds), '-ac', '2',
        '-c:a', 'libmp3lame', source], 30000);
      const result = await prepareStatusAudio(await fs.readFile(source));
      assert.equal(result.ptt, true);
      assert.equal(result.mimetype, 'audio/ogg; codecs=opus');
      assert.equal(result.audio.subarray(0, 4).toString(), 'OggS');
      const output = path.join(dir, 'result.ogg');
      await fs.writeFile(output, result.audio);
      const probe = JSON.parse(await runOnce(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]));
      assert.equal(probe.streams[0].codec_name, 'opus');
      assert.equal(probe.streams[0].channels, 1);
      assert.equal(probe.streams[0].sample_rate, '48000');
      assert.ok(Math.abs(Number(probe.format.duration) - Math.min(seconds, 240)) < 0.1);
      assert.ok(result.seconds <= 240);
      // Decode the complete output; headers alone do not prove it is playable.
      await runOnce(ffmpeg, ['-v', 'error', '-xerror', '-i', output, '-f', 'null', '-'], 30000);
    }
    await assert.rejects(prepareStatusAudio(Buffer.from('not audio')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
