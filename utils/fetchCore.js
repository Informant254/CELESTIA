'use strict';

const fs    = require('fs');
const path  = require('path');

// CELESTIA - Heavenly local commands (no external fetch, fully self-contained)
const PRESERVED = new Set(['spam.js', 'menu.js', 'ping.js', 'ai.js', 'sticker.js', 'clearcache.js']);

async function fetchCore() {
  console.log('🔄 CELESTIA heavenly - using local commands (self-contained, no remote fetch)');
  console.log(`   Preserved heavenly: ${[...PRESERVED].join(', ')}`);
  const localFolder = path.join(__dirname, '..', 'commands');
  const count = fs.existsSync(localFolder) ? fs.readdirSync(localFolder).filter(f=>f.endsWith('.js')).length : 0;
  console.log(`✅ CELESTIA ready - ${count} heavenly commands integrated (local)`);
  return true;
}

module.exports = { fetchCore };
