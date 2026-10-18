/* CELESTIA "Another Love": the chorus, looping from a self-hosted clip.
 * Playback uses public/chorus.mp3 — no external audio requests.
 * Browsers block audible autoplay until a gesture: we try anyway, then
 * start on the first tap/click/keypress (unless the user paused us).
 */
(() => {
  const toggle = document.getElementById('music-toggle');
  const volume = document.getElementById('music-volume');
  const status = document.getElementById('music-status');
  const audio = new Audio('./chorus.mp3');
  audio.loop = true;
  audio.preload = 'auto';
  let playing = false;
  let userPaused = false;
  let degraded = false;
  let armed = false;

  const gestureEvents = ['pointerdown', 'keydown', 'touchstart'];

  function setVolume() {
    audio.volume = Math.min(1, Math.max(0, Number(volume.value) / 100));
  }

  function showState() {
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.setAttribute('aria-label', playing ? 'Pause background music' : 'Play background music');
    toggle.textContent = playing ? '♫ Pause background music' : '♫ Play background music';
    status.textContent = playing
      ? 'Another Love · the chorus, playing softly'
      : 'Another Love · the chorus, on loop. Tap to play.';
  }

  async function play() {
    try {
      setVolume();
      await audio.play();
      playing = true;
      userPaused = false;
      showState();
    } catch {
      playing = false;
      showState();
    }
  }

  function pause() {
    audio.pause();
    playing = false;
    showState();
  }

  const fireOnGesture = (event) => {
    if (!armed) return;
    if (event && event.target && toggle.contains(event.target)) return;
    stopArming();
    if (!userPaused && !degraded) play();
  };
  function stopArming() {
    armed = false;
    gestureEvents.forEach((name) => document.removeEventListener(name, fireOnGesture));
  }
  function arm() {
    if (armed) return;
    armed = true;
    gestureEvents.forEach((name) => document.addEventListener(name, fireOnGesture, { passive: true }));
  }

  if (!audio.canPlayType || audio.canPlayType('audio/mpeg') === '') {
    degraded = true;
    toggle.disabled = true;
    volume.disabled = true;
    status.textContent = 'Background music is not supported by this browser.';
    return;
  }

  audio.addEventListener('error', () => {
    degraded = true;
    stopArming();
    toggle.disabled = true;
    status.textContent = 'Music clip unavailable right now.';
    showState();
  });

  toggle.addEventListener('click', () => {
    if (degraded) return;
    stopArming();
    if (playing) {
      userPaused = true;
      pause();
    } else {
      play();
    }
  });

  volume.addEventListener('input', setVolume);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) pause();
  });
  window.addEventListener('pagehide', () => {
    audio.pause();
    playing = false;
  });

  (async () => {
    showState();
    setVolume();
    await play();
    if (!playing && !degraded && !userPaused) arm();
  })();
})();
