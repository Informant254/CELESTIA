/**
 * download/queue.js — controlled concurrency (default 2 at a time).
 */
const cfg = require('./config');

let active = 0;
const waiting = [];

function stats() {
  return { active, waiting: waiting.length, max: cfg.MAX_CONCURRENT_DOWNLOADS };
}

function acquire() {
  if (active < cfg.MAX_CONCURRENT_DOWNLOADS) {
    active += 1;
    return { slot: true, position: 0 };
  }
  const position = waiting.length + 1;
  return new Promise((resolve) => {
    waiting.push(() => {
      active += 1;
      resolve({ slot: true, position: 0 });
    });
  }).then((r) => ({ ...r, queued: true, position }));
}

function release() {
  active = Math.max(0, active - 1);
  const next = waiting.shift();
  if (next) next();
}

async function run(fn) {
  const ticket = await acquire();
  try {
    return { ...(await fn(ticket)), ticket };
  } finally {
    release();
  }
}

module.exports = { acquire, release, run, stats };
