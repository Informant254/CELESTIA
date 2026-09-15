const dl = require('../download/index');

module.exports = {
  name: 'video',
  aliases: ['ytv', 'ytmp4'],
  description: 'Search YouTube by name, pick a result + quality. Usage: .video <name>',
  async execute(sock, msg, args) {
    await dl.handleSearchCommand(sock, msg, 'video', args.join(' '));
  },
};
