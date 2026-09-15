const dl = require('../download/index');

module.exports = {
  name: 'song',
  description: 'Download a song by name. Usage: .song <song name>',
  async execute(sock, msg, args) {
    await dl.handleSearchCommand(sock, msg, 'audio', args.join(' '));
  },
};
