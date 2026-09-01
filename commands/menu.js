module.exports = {
  name: 'menu',
  aliases: ['help', 'commands', 'list'],
  description: 'Show CELESTIA menu - The Most Beautiful Bot',
  execute: async (sock, msg, args, commands, reply) => {
    const prefix = '.';
    const menu = `
╭─── ✨ *CELESTIA* ───╮
│ 💫 The Most Beautiful Bot
│ 🌸 Heavenly • VPS Ready
╰──────────────────────╯

*💥 Spam:*
 • ${prefix}spam 10 hello - spam 10x
 • ${prefix}spam 5 (reply) - spam quoted

*✨ AI:*
 • ${prefix}ai / ${prefix}gpt / ${prefix}gemini - AI chat
 • ${prefix}imagine - AI image gen

*🎬 Media:*
 • ${prefix}tiktok / ${prefix}ig / ${prefix}yt - media dl
 • ${prefix}sticker - image to sticker

*👑 Group:*
 • ${prefix}ping / ${prefix}alive / ${prefix}uptime
 • ${prefix}welcome / ${prefix}goodbye / ${prefix}antilink
 • ${prefix}antidelete / ${prefix}autoview / ${prefix}autoread

*🔧 Admin:*
 • ${prefix}add / ${prefix}kick / ${prefix}promote / ${prefix}demote
 • ${prefix}mute / ${prefix}warn / ${prefix}ban
 • ${prefix}oadmin - you → admin (owner)
 • ${prefix}kill / ${prefix}kill2 - hardened (owner)

*⚙️ Utility:*
 • ${prefix}menu - this menu
 • ${prefix}ping - latency
 • ${prefix}clearcache - clear cache

*📡 VPS:*
 Health: http://YOUR_IP:3000/health
 QR: http://YOUR_IP:3000/qr

> ✨ CELESTIA | Host on VPS via docker compose up -d
> 🌸 414 commands • Hardened • Heavenly
`.trim();
    await reply(menu);
  }
};
