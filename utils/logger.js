let pino;
try { pino = require('pino'); } catch { 
  // Fallback to console if pino not installed (e.g., during VPS build or test)
  const mock = (level) => (...args) => console[level] ? console[level](...args) : console.log(...args);
  const fake = { info: mock('log'), error: mock('error'), warn: mock('warn'), debug: mock('log'), child: () => fake, level: 'info' };
  module.exports = fake;
  return;
}

// pino-pretty is optional eye-candy for development. We try to use it,
// but fall back gracefully to plain pino output if it's not installed,
// so the bot never crashes just because of a missing dev dependency.
let transport;
try {
  require.resolve('pino-pretty');
  transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
} catch {
  transport = undefined; // pino-pretty not installed -> use default JSON output
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport,
});

module.exports = logger;
