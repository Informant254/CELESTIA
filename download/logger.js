/**
 * download/logger.js — structured internal logging.
 * Everything here stays in the console. The user NEVER sees these lines.
 */
function ts() {
  return new Date().toISOString();
}

function line(tag, fields) {
  const parts = Object.entries(fields || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`);
  console.log(`[${tag}] ${ts()} ${parts.join(' ')}`.trim());
}

module.exports = {
  celestia: (fields) => line('CELESTIA', fields),
  search: (fields) => line('SEARCH', fields),
  select: (fields) => line('SELECT', fields),
  download: (fields) => line('DOWNLOAD', fields),
  fallback: (fields) => line('FALLBACK', fields),
  validate: (fields) => line('VALIDATE', fields),
  upload: (fields) => line('UPLOAD', fields),
  cleanup: (fields) => line('CLEANUP', fields),
};
