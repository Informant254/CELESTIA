const config = require('../config/config');
const apis = require('../config/apis');
const { isDev } = require('../utils/isDev');
const settingsStore = require('../utils/settingsStore');
const util = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

module.exports = {
  name: 'eval',
  aliases: ['=>'],
  description: 'Runs raw JavaScript for debugging (dev only). Shortcuts: .eval api | settings | uptime | version | commands | env',
  async execute(sock, msg, args, commands) {
    const jid = msg.key.remoteJid;

    if (!isDev(msg, sock)) {
      return sock.sendMessage(jid, { text: '❌ Only the dev, ᴾᴬᴾᴾᴵ ᴵˢᴬᴬᶜ can execute this command dumbass.' }, { quoted: msg });
    }

    const code = args.join(' ');

    if (!code) {
      return sock.sendMessage(jid, { text: '❌ Provide code to run.\n\nUsage: *.eval 1 + 1*' }, { quoted: msg });
    }

    const keyword = args[0]?.toLowerCase();

    if (keyword === 'api') {
      return sock.sendMessage(jid, {
        text: `🔗 *Current API:*\n${JSON.stringify(apis, null, 2)}`
      }, { quoted: msg });
    }

    if (keyword === 'settings') {
      return sock.sendMessage(jid, {
        text: `⚙️ *Settings:*\n${JSON.stringify(settingsStore.getAll(), null, 2)}`
      }, { quoted: msg });
    }

    if (keyword === 'uptime') {
      const uptimeSeconds = process.uptime();
      const h = Math.floor(uptimeSeconds / 3600);
      const m = Math.floor((uptimeSeconds % 3600) / 60);
      const s = Math.floor(uptimeSeconds % 60);
      const mem = process.memoryUsage();

      const text =
        `⏱️ *Uptime:* ${h}h ${m}m ${s}s\n\n` +
        `💾 *Memory:*\n` +
        `RSS: ${(mem.rss / 1024 / 1024).toFixed(1)} MB\n` +
        `Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB\n` +
        `Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`;

      return sock.sendMessage(jid, { text }, { quoted: msg });
    }

    if (keyword === 'version') {
      let baileysVersion = 'unknown';
      let pkgVersion = 'unknown';

      try {
        baileysVersion = require('@whiskeysockets/baileys/package.json').version;
      } catch {}

      try {
        pkgVersion = require('../package.json').version;
      } catch {}

      const text =
        `📦 *Versions:*\n` +
        `Node.js: ${process.version}\n` +
        `Baileys: ${baileysVersion}\n` +
        `CELESTIA: ${pkgVersion}`;

      return sock.sendMessage(jid, { text }, { quoted: msg });
    }

    if (keyword === 'commands') {
      const uniqueCommands = new Set(commands.values());
      const names = [...uniqueCommands].map((c) => c.name).sort();

      const text =
        `🔌 *Loaded Commands (${names.length}):*\n${names.join(', ')}`;

      return sock.sendMessage(
        jid,
        {
          text: text.length > 4000 ? text.slice(0, 4000) : text
        },
        { quoted: msg }
      );
    }

    if (keyword === 'env') {
      const keys = Object.keys(process.env).sort();

      return sock.sendMessage(
        jid,
        {
          text: `🔑 *Environment Variable Names (${keys.length}):*\n${keys.join(', ')}`
        },
        { quoted: msg }
      );
    }

    try {
      let result;

      const evalArgs = [
        'sock',
        'msg',
        'jid',
        'config',
        'apis',
        'commands',
        'settingsStore',
        'util',
        'fs',
        'path',
        'os',
        'axios',
        'process',
        'Buffer',
        'require',
        'JSON',
        'Math',
        'Date',
        'Promise',
        'Object',
        'Array',
        'String',
        'Number',
        'Boolean',
        'RegExp',
        'Map',
        'Set',
        'fetch',
        'console',
        'isDev'
      ];

      const evalValues = [
        sock,
        msg,
        jid,
        config,
        apis,
        commands,
        settingsStore,
        util,
        fs,
        path,
        os,
        axios,
        process,
        Buffer,
        require,
        JSON,
        Math,
        Date,
        Promise,
        Object,
        Array,
        String,
        Number,
        Boolean,
        RegExp,
        Map,
        Set,
        fetch,
        console,
        isDev
      ];

      if (code.includes('await')) {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

        const fn = new AsyncFunction(
          ...evalArgs,
          `return ${code}`
        );

        result = await fn(...evalValues);
      } else {
        const fn = new Function(
          ...evalArgs,
          `return ${code}`
        );

        result = fn(...evalValues);
      }

      if (typeof result !== 'string') {
        result = util.inspect(result, { depth: 2 });
      }

      if (result.length <= 4000) {
        await sock.sendMessage(
          jid,
          { text: result },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          jid,
          { text: result.slice(0, 4000) },
          { quoted: msg }
        );

        for (let i = 4000; i < result.length; i += 4000) {
          await sock.sendMessage(jid, {
            text: result.slice(i, i + 4000)
          });
        }
      }

    } catch (error) {
      await sock.sendMessage(
        jid,
        { text: `⚠️ ${error.message}` },
        { quoted: msg }
      );
    }
  },
};
