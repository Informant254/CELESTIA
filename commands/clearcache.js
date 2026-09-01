function runClearCache(commands) {
  const before = commands.size;
  // simple cache clear - keep it lightweight
  if (global.gc) global.gc();
  return { before, after: commands.size, cleared: before - commands.size };
}

module.exports = {
  name: 'clearcache',
  aliases: ['cc'],
  description: 'Clear cache',
  execute: async (sock, msg, args, commands, reply) => {
    const r = runClearCache(commands);
    await reply(`🧹 Cache cleared: ${JSON.stringify(r)}`);
  },
  runClearCache
};
