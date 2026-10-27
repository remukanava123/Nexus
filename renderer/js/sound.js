// Quiet synthesized UI sounds and a faint ambient hum (big-screen mode). No audio files: everything is generated with WebAudio.
const sfx = (() => {
  let ctx = null, master = null, hum = null;
  const cfg = () => (typeof prefs !== 'undefined' && prefs.settings) || {};
  const vol = () => (cfg().sounds === false ? 0 : (cfg().soundVolume ?? 40) / 100);

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = vol() * 0.6; // everything stays well under full volume
    return ctx;
  }

  function tone(freq, t0, dur, { type = 'sine', gain = 0.15, slideTo = null, attack = 0.006, to = null } = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(to || master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  const SOUNDS = {
    tick: (t) => tone(1040, t, 0.05, { gain: 0.1, slideTo: 880 }),
    select: (t) => { tone(660, t, 0.09, { gain: 0.14 }); tone(990, t + 0.07, 0.15, { gain: 0.14 }); },
    open: (t) => tone(440, t, 0.22, { gain: 0.1, slideTo: 880 }),
    back: (t) => tone(520, t, 0.09, { gain: 0.12, slideTo: 380 }),
    launch: (t) => { tone(330, t, 0.55, { gain: 0.14, slideTo: 1320 }); tone(660, t + 0.04, 0.55, { gain: 0.06, slideTo: 1980 }); },
    boot: (t) => {
      const lp = ctx.createBiquadFilter(); // soft, warm chord
      lp.type = 'lowpass'; lp.frequency.value = 2400; lp.connect(master);
      [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(f, t + i * 0.1, 1.8, { gain: 0.07, attack: 0.14, to: lp }));
    },
  };

  function osc(type, freq) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }


  function startHum() {
    if (hum) return;
    ensure();
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 170;
    const nodes = [osc('sawtooth', 55), osc('sawtooth', 55.4), osc('sine', 110)];
    nodes.forEach((o) => o.connect(lp));
    lp.connect(g);
    g.connect(master);
    const lfo = osc('sine', 0.11), lfoGain = ctx.createGain(); // slow breathing
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    [...nodes, lfo].forEach((o) => o.start());
    g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2.5);
    hum = { g, nodes: [...nodes, lfo] };
  }
  function stopHum() {
    if (!hum) return;
    const { g, nodes } = hum;
    hum = null;
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    setTimeout(() => nodes.forEach((o) => { try { o.stop(); } catch {} }), 900);
  }

  return {
    play(name) {
      if (vol() === 0 || !SOUNDS[name]) return;
      try { ensure(); SOUNDS[name](ctx.currentTime + 0.01); } catch {}
    },
    // Hum only while big-screen mode is open and sound + hum are enabled
    refresh() {
      const want = typeof big !== 'undefined' && big.on && cfg().ambientHum !== false && vol() > 0;
      try { want ? startHum() : stopHum(); if (ctx && master) master.gain.value = vol() * 0.6; } catch {}
    },
  };
})();

// Hovering an animated sidebar button plays its own short sound (only while Nexus is the window you are using).
// The files in assets/sounds are already trimmed and level-matched; this only sets how loud they are overall.
const HOVER_FILES = { home: 'home', games: 'games', apps: 'apps', web: 'web', favorites: 'favorites', stats: 'stats', barca: 'barca', news: 'news', gacha: 'gacha', settings: 'settings' }; // Overwatch has no sound
const HOVER_LEVEL = 0.3; // a quiet background touch: 1 would be full volume
const hoverAudio = {};
function playHover(view) {
  const file = HOVER_FILES[view];
  if (!file) return;
  const vol = (prefs.settings.sounds === false ? 0 : (prefs.settings.soundVolume ?? 40) / 100) * HOVER_LEVEL;
  if (vol <= 0) return;
  const a = hoverAudio[file] || (hoverAudio[file] = new Audio(`../assets/sounds/${file}.wav`));
  a.volume = Math.min(1, vol);
  a.currentTime = 0;
  a.play().catch(() => {});
}
let lastHoverSound = 0;
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest && e.target.closest('.sidebar button[data-view]');
  if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return;
  if (prefs.settings.hoverSounds === false || document.body.classList.contains('no-anim') || !document.hasFocus()) return;
  if (Date.now() - lastHoverSound < 120) return;
  lastHoverSound = Date.now();
  playHover(b.dataset.view);
});
