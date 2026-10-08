/* CELESTIA "Starlight": an original ambient loop rendered locally.
 * Playback begins only from the music button. No external audio requests.
 */
(() => {
  const toggle = document.getElementById('music-toggle');
  const volume = document.getElementById('music-volume');
  const status = document.getElementById('music-status');
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let context;
  let gain;
  let playing = false;
  let busy = false;

  function showState() {
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.setAttribute('aria-label', playing ? 'Pause background music' : 'Play background music');
    toggle.textContent = playing ? '♫ Pause background music' : '♫ Play background music';
    status.textContent = playing ? 'Starlight · playing softly' : 'Starlight · paused. Tap to play.';
  }

  function renderLoop(audio) {
    const rate = 22050;
    const duration = 16;
    const buffer = audio.createBuffer(1, rate * duration, rate);
    const data = buffer.getChannelData(0);
    // A minor → F major → C major → G major, with a gentle bell melody.
    const chords = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]];
    const melody = [76, 72, 69, 72, 77, 76, 72, 69, 76, 79, 76, 72, 74, 71, 67, 71];
    const frequency = (note) => 440 * 2 ** ((note - 69) / 12);
    const chordFrequencies = chords.map((notes) => notes.map(frequency));
    const melodyFrequencies = melody.map(frequency);
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      const chord = Math.floor(t / 4);
      const chordTime = t % 4;
      const padEnvelope = Math.sin(Math.PI * chordTime / 4) ** 2;
      let pad = 0;
      for (const hz of chordFrequencies[chord]) {
        pad += Math.sin(2 * Math.PI * hz * chordTime) * 0.13;
        pad += Math.sin(2 * Math.PI * hz * 1.003 * chordTime) * 0.035;
      }
      const note = Math.floor(t);
      const noteTime = t % 1;
      const bellEnvelope = Math.sin(Math.PI * noteTime) ** 2 * Math.exp(-3 * noteTime);
      const bell = Math.sin(2 * Math.PI * melodyFrequencies[note] * noteTime) * 0.25;
      data[i] = pad * padEnvelope + bell * bellEnvelope;
    }
    return buffer;
  }

  async function pause() {
    if (context && context.state !== 'closed') await context.suspend();
    playing = false;
    showState();
  }

  if (!AudioContext) {
    toggle.disabled = true;
    volume.disabled = true;
    status.textContent = 'Background music is not supported by this browser.';
    return;
  }

  toggle.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    toggle.disabled = true;
    try {
      if (playing) {
        await pause();
      } else {
        if (!context || context.state === 'closed') {
          context = new AudioContext();
          gain = context.createGain();
          gain.gain.value = Number(volume.value) / 100;
          gain.connect(context.destination);
          const source = context.createBufferSource();
          source.buffer = renderLoop(context);
          source.loop = true;
          source.connect(gain);
          source.start();
        }
        await context.resume();
        playing = true;
        showState();
      }
    } catch {
      playing = false;
      showState();
      status.textContent = 'Could not start music. Tap to try again.';
    } finally {
      busy = false;
      toggle.disabled = false;
    }
  });

  volume.addEventListener('input', () => {
    if (gain && context.state !== 'closed') {
      gain.gain.setTargetAtTime(Number(volume.value) / 100, context.currentTime, 0.05);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) pause().catch(() => {});
  });
  window.addEventListener('pagehide', () => {
    if (context && context.state !== 'closed') context.close().catch(() => {});
    playing = false;
    showState();
  });
})();
