const fs = require('fs');
const path = require('path');
const backend = require('../autochat/backend');
const speech = require('../utils/speech');
const studio = require('../utils/mediaStudio');
const { ffmpegPath, runOnce } = require('../download/engines');
const { jobDir, wipeDir } = require('../download/cleanup');

let rendering = false;

function clean(value, max) {
  return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parsePlan(raw, topic) {
  try {
    const json = String(raw || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const value = JSON.parse(json);
    const scenes = Array.isArray(value.scenes) ? value.scenes.slice(0, 4).map((scene) => ({
      caption: clean(scene.caption, 90), narration: clean(scene.narration, 260), imagePrompt: clean(scene.imagePrompt, 420),
    })).filter((scene) => scene.caption && scene.narration) : [];
    if (scenes.length >= 3) return { title: clean(value.title, 70) || clean(topic, 70), scenes };
  } catch {}
  return {
    title: clean(topic, 70),
    scenes: [
      { caption: 'THE IDEA', narration: `Here is what matters about ${topic}.`, imagePrompt: `${topic}, cinematic opening scene` },
      { caption: 'WHY IT MATTERS', narration: `Understanding the real impact can change how we think and act.`, imagePrompt: `${topic}, meaningful human impact, cinematic` },
      { caption: 'THE NEXT MOVE', narration: `Start with one practical step today, then build momentum from there.`, imagePrompt: `${topic}, hopeful future, cinematic closing scene` },
    ],
  };
}

module.exports = {
  name: 'faceless', aliases: ['facelessvideo', 'fvf'], description: 'Turn a topic into a narrated portrait short video',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const topic = clean(args.join(' '), 300);
    if (!topic) return sock.sendMessage(jid, { text: '🎬 Use `.faceless <topic>`\nExample: `.faceless three habits that improve focus`' }, { quoted: msg });
    if (rendering) return sock.sendMessage(jid, { text: '🎬 The video factory is busy with another render. Try again shortly.' }, { quoted: msg });
    rendering = true;
    const dir = jobDir('faceless');
    try {
      await sock.sendMessage(jid, { text: '🎬 *Faceless Factory started*\nWriting script → creating scenes → recording narration → rendering captions.' }, { quoted: msg });
      const result = await backend.complete(
        'Create a concise 20-35 second faceless vertical video plan. Return strict JSON only: {"title":"...","scenes":[{"caption":"2-6 words","narration":"one concise sentence","imagePrompt":"text-free cinematic vertical visual"}]}. Exactly 3 scenes. No markdown. No unsafe content. Do not attribute invented facts.',
        topic
      );
      const plan = parsePlan(result?.text, topic);
      const imagePaths = [];
      for (let i = 0; i < plan.scenes.length; i++) {
        const scene = plan.scenes[i];
        const output = path.join(dir, `scene-${i + 1}.jpg`);
        let background = null;
        try {
          background = await studio.generateImage(`${scene.imagePrompt}, premium cinematic photography, vertical portrait, no text, no letters, no logo, no watermark`);
        } catch (error) {
          console.warn(`[faceless] scene ${i + 1} image fallback: ${String(error.message).slice(0, 80)}`);
        }
        await studio.createCard({ text: scene.caption, title: plan.title, author: `${i + 1} / ${plan.scenes.length}`, background, output });
        imagePaths.push(output);
      }
      const narration = plan.scenes.map((scene) => scene.narration).join(' ');
      const audio = path.join(dir, 'narration.ogg');
      fs.writeFileSync(audio, await speech.synthesizeVoice(narration));
      const duration = Math.min(45, Math.max(9, await studio.mediaDuration(audio)));
      const each = duration / imagePaths.length;
      const manifest = path.join(dir, 'scenes.txt');
      const lines = [];
      for (const image of imagePaths) {
        lines.push(`file '${image.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
        lines.push(`duration ${each.toFixed(3)}`);
      }
      lines.push(`file '${imagePaths.at(-1).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
      fs.writeFileSync(manifest, `${lines.join('\n')}\n`);
      const output = path.join(dir, 'celestia-faceless.mp4');
      await runOnce(ffmpegPath(), ['-y', '-f', 'concat', '-safe', '0', '-i', manifest, '-i', audio, '-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p', '-r', '24', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-shortest', output], 600000);
      if (fs.statSync(output).size > studio.WA_LIMIT) throw new Error('Final video exceeded WhatsApp 16MB limit');
      await sock.sendMessage(jid, { video: { url: output }, mimetype: 'video/mp4', fileName: 'celestia-faceless.mp4', caption: `🎬 *${plan.title}*\n_${plan.scenes.length} scenes · narrated by CELESTIA_` }, { quoted: msg });
    } catch (error) {
      console.error('[FACELESS]', String(error.message).slice(0, 180));
      await sock.sendMessage(jid, { text: `❌ Faceless Factory failed: ${error.message}` }, { quoted: msg });
    } finally {
      rendering = false;
      wipeDir(dir);
    }
  },
  _internals: { parsePlan },
};
