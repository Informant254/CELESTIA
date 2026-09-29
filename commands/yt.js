const dl = require('../download/index');

module.exports = {
  name: 'yt',
  aliases: ['ytvideo', 'ytv'],
  description: 'Search and download a YouTube video. Usage: .yt [360p|480p|720p|1080p] <name or link>',
  async execute(sock, msg, args) {
    await dl.handleSearchCommand(sock, msg, 'video', args.join(' '));
  },
};
