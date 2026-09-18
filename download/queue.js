/**
 * download/queue.js — controlled concurrency (default 2 at a time).
 */
const cfg = require('./config');

let active = 0;
const waiting = [];

function stats() {
  return { active, waiting: waiting.length, max: cfg.MAX_CONCURRENT_DOWNLOADS, maxWaiting: cfg.MAX_QUEUE_WAITING };
}

function queueError(message) {
  const err = new Error(message);
  err.code = 'QUEUE_FULL';
  return err;
}

function acquire(owner) {
  if (active < cfg.MAX_CONCURRENT_DOWNLOADS) {
    active += 1;
    return { slot: true, position: 0 };
  }
  const key = owner == null ? null : String(owner);
  if (waiting.length >= cfg.MAX_QUEUE_WAITING) {
    return Promise.reject(queueError('Download queue is full. Try again later.'));
  }
  if (key && waiting.filter((job) => job.owner === key).length >= cfg.MAX_QUEUE_PER_OWNER) {
    return Promise.reject(queueError('You already have too many downloads waiting.'));
  }
  const position = waiting.length + 1;
  return new Promise((resolve, reject) => {
    const job = { owner: key, resolve: null, timer: null };
    job.resolve = () => {
      clearTimeout(job.timer);
      active += 1;
      resolve({ slot: true, position: 0 });
    };
    job.timer = setTimeout(() => {
      const index = waiting.indexOf(job);
      if (index !== -1) waiting.splice(index, 1);
      reject(queueError('Download queue wait timed out. Try again later.'));
    }, cfg.QUEUE_WAIT_TIMEOUT_MS);
    if (job.timer.unref) job.timer.unref();
    waiting.push(job);
  }).then((r) => ({ ...r, queued: true, position }));
}

function release() {
  active = Math.max(0, active - 1);
  const next = waiting.shift();
  if (next) next.resolve();
}

async function run(fn, owner) {
  const ticket = await acquire(owner);
  try {
    return { ...(await fn(ticket)), ticket };
  } finally {
    release();
  }
}

module.exports = { acquire, release, run, stats };
