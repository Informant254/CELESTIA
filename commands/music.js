const dl = require('../download/index');

module.exports = {
  name: 'music',
  aliases: ['mus'],
  description: 'Search by track name, pick a result, get the music. Usage: .music <name>',
  async execute(sock, msg, args) {
    await dl.handleSearchCommand(sock, msg, 'audio', args.join(' '));
  },
};
