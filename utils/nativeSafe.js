/**
 * Optional native modules (sharp, ffmpeg-static, wa-sticker-formatter)
 * may fail to install on some platforms (e.g. Node 25 without prebuilds).
 * They live in optionalDependencies so `npm install` never dies because
 * of them — and this helper lets code degrade gracefully instead of
 * crashing the whole bot at require-time (which is what kills panels).
 *
 * Usage:
 *   const { need } = require('../utils/nativeSafe');
 *   const sharp = need('sharp'); // throws a friendly Error only when called
 */
function tryRequire(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

function need(name, friendlyName) {
  const mod = tryRequire(name);
  if (!mod) {
    const err = new Error(
      `${friendlyName || name} is not available on this host (native module failed to install). ` +
      `The bot keeps running — only features needing it are affected.`
    );
    err.code = 'NATIVE_MISSING';
    throw err;
  }
  return mod;
}

module.exports = { tryRequire, need };
