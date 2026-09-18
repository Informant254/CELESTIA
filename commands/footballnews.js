const axios = require("axios");

// Free, keyless source (verified live): BBC Sport Football RSS feed.
const FEED_URL = "https://feeds.bbci.co.uk/sport/football/rss.xml";

const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

function clean(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 8) {
    const body = m[1];
    const t = body.match(/<title>([\s\S]*?)<\/title>/);
    const l = body.match(/<link>([\s\S]*?)<\/link>/);
    const d = body.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const title = clean(t && t[1]);
    if (!title) continue;
    items.push({ title, link: clean(l && l[1]), date: clean(d && d[1]) });
  }
  return items;
}

module.exports = {
  name: "news",
  description: "Get the latest football news.",

  async execute(sock, msg) {
    const chatId = msg.key.remoteJid;

    try {
      const loading = await sock.sendMessage(
        chatId,
        { text: "📰 Fetching latest football news..." },
        { quoted: msg }
      );

      const { data } = await axios.get(FEED_URL, {
        timeout: 20000,
        headers: { "User-Agent": "Mozilla/5.0" },
        responseType: "text",
      });

      const news = parseRss(String(data));

      if (!news.length) {
        return await sock.sendMessage(chatId, {
          text: box("📰 FOOTBALL NEWS", ["❌ No football news found.", "Please try again later."]),
          edit: loading.key,
        });
      }

      const lines = [];
      news.forEach((item, i) => {
        lines.push(`*${i + 1}. ${item.title}*`);
        if (item.date) lines.push(`📅 ${item.date}`);
        if (item.link) lines.push(`🔗 ${item.link}`);
        lines.push("");
      });
      lines.push("Source: BBC Sport.");

      await sock.sendMessage(chatId, {
        text: box("📰 LATEST FOOTBALL NEWS", lines),
        edit: loading.key,
      });
    } catch (err) {
      await sock.sendMessage(chatId, {
        text: box("📰 FOOTBALL NEWS", ["❌ Failed to fetch football news.", "Please try again later."]),
      });
    }
  },
};
