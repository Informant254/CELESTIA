const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

function load(relative, mocks) {
  const filename = path.resolve(__dirname, relative);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  const requireMock = (id) => Object.hasOwn(mocks, id) ? mocks[id] : nativeRequire(id);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: requireMock, module, exports: module.exports, process, console,
    Buffer, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
  }, { filename });
  return module.exports;
}

test('video validation rejects audio with cover art but accepts a real video stream', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-validation-'));
  const file = path.join(dir, 'out.mp4');
  fs.writeFileSync(file, 'fixture');
  let streams = [{ codec_type: 'audio' }, { codec_type: 'video', disposition: { attached_pic: 1 } }];
  const fallback = load('../download/fallback.js', {
    './ffmpeg': { streams: async () => streams },
    './logger': { validate() {} },
  });
  try {
    await assert.rejects(fallback.validateFile(file, false), /no video stream/);
    streams = [{ codec_type: 'audio' }];
    await assert.rejects(fallback.validateFile(file, false), /no video stream/);
    streams.push({ codec_type: 'video', disposition: { attached_pic: 0 } });
    assert.equal(await fallback.validateFile(file, false), 7);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy video downloads send normalized video bytes and clean up after consumption', async () => {
  let workDir;
  let validated = false;
  const dl = load('../utils/downloader.js', {
    '../download/queue': { run: async (fn) => fn() },
    '../download/fallback': {
      downloadWithFallback: async (options) => {
        assert.equal(options.isAudio, false);
        workDir = options.workDir;
        const file = path.join(workDir, 'raw.mp4');
        fs.writeFileSync(file, 'raw');
        return { file, size: 3 };
      },
      validateFile: async (file, isAudio) => {
        assert.equal(isAudio, false);
        assert.equal(path.basename(file), 'wa.mp4');
        validated = true;
        return fs.statSync(file).size;
      },
    },
    '../download/ffmpeg': {
      normalizeForWhatsApp: async (file, dir) => {
        assert.equal(fs.readFileSync(file, 'utf8'), 'raw');
        const output = path.join(dir, 'wa.mp4');
        fs.writeFileSync(output, 'normalized');
        return output;
      },
    },
  });
  const result = await dl.downloadYoutubeVideo('https://www.youtube.com/watch?v=MwpMEbgC7DA', 'Test', undefined, null, async (media) => {
    assert.equal(validated, true);
    assert.equal(media.buffer.toString(), 'normalized');
    assert.equal(media.size, 10);
    assert.equal(fs.existsSync(media.file), true);
    return 'sent';
  });
  assert.equal(result, 'sent');
  assert.equal(fs.existsSync(workDir), false);
});
