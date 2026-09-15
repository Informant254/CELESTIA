const dl = require('../download/index');

module.exports = {
  name: 'audio',
  description: 'Search and download audio by name. Usage: .audio <song name or link>',
  async execute(sock, msg, args) {
    await dl.handleSearchCommand(sock, msg, 'audio', args.join(' '));
  },
};
