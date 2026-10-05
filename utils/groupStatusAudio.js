const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { ensureFfmpegPath, ensureFfprobePath, runOnce } = require('../download/engines');

// Status audio uses a voice-note payload, not a full-length chat music attachment.
const MAX_SECONDS = 240;

async function prepareStatusAudio(buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'celestia-status-audio-'));
  try {
    const input = path.join(dir, 'source');
    const output = path.join(dir, 'status.ogg');
    await fs.writeFile(input, buffer);
    await runOnce(await ensureFfmpegPath(), [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', input,
      '-map', '0:a:0', '-vn', '-t', String(MAX_SECONDS), '-map_metadata', '-1',
      '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k',
      '-application', 'audio', '-f', 'ogg', output,
    ], 120000);
    const duration = Number(await runOnce(await ensureFfprobePath(), [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', output,
    ], 30000));
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Audio has no playable duration');
    return {
      audio: await fs.readFile(output),
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
      seconds: Math.min(MAX_SECONDS, Math.ceil(duration)),
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { prepareStatusAudio, MAX_SECONDS };
