const downloaders = {
  facebook: require('./fb'),
  instagram: require('./ig'),
  tiktok: require('./tiktok'),
  twitter: require('./twitter'),
};

module.exports = {
  name: 'socialdl',
  description: 'Download media from TikTok, Instagram, Facebook, or Twitter/X. Usage: .socialdl <url>',

  async execute(sock, msg, args, commands, reply) {
    const url = args[0];
    let platform;

    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (hostname === 'fb.watch' || hostname.endsWith('.facebook.com') || hostname === 'facebook.com') {
        platform = 'facebook';
      } else if (hostname.endsWith('.instagram.com') || hostname === 'instagram.com') {
        platform = 'instagram';
      } else if (hostname.endsWith('.tiktok.com') || hostname === 'tiktok.com') {
        platform = 'tiktok';
      } else if (hostname.endsWith('.twitter.com') || hostname === 'twitter.com' || hostname.endsWith('.x.com') || hostname === 'x.com') {
        platform = 'twitter';
      }
    } catch {}

    if (!platform) {
      return reply('Provide a TikTok, Instagram, Facebook, or Twitter/X URL. Example: `.socialdl <url>`');
    }

    return downloaders[platform].execute(sock, msg, args, commands, reply);
  },
};
