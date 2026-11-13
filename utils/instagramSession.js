const fs = require('fs');
const path = require('path');

function readCookie() {
  const files = [...new Set([path.join('data', 'instagram-cookie.txt'), process.env.INSTAGRAM_COOKIE_FILE].filter(Boolean))];
  let value = process.env.INSTAGRAM_COOKIE || '';
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > 64 * 1024) return '';
      value = fs.readFileSync(file, 'utf8');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') return '';
    }
  }
  const cookie = String(value).trim().replace(/^cookie:\s*/i, '');
  if (!/^[\x20-\x7e]+$/.test(cookie) || !/(?:^|;\s*)sessionid=[^;]+/.test(cookie)) return '';
  return cookie;
}

module.exports = { readCookie };
