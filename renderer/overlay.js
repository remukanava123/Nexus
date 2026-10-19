// The in-game overlay. Widgets (music, today's record, last games, Overwatch career, session, clock) are positioned
// and scaled by a saved layout. In edit mode the window catches the mouse: drag to move, wheel to resize.
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

let cfg = { music: true, bars: true, stats: true, accent: '#7c5cff', opacity: 100 };
let media = { ok: false }, thumb = '', coverUrl = '';
let state = { game: '', session: 0, today: [], now: Date.now(), all: 0 };
let owData = null;
let layout = {};
let editing = false, selected = '';

const SAMPLE_MEDIA = { ok: true, title: 'Midnight City', artist: 'M83', playing: true, pos: 62, dur: 243, at: Date.now() };
const SAMPLE_STATE = { game: 'Overwatch 2', session: Date.now() - 47 * 60000, now: Date.now(), all: 6, today: ['w', 'w', 'l', 'w', 'l', 'w'].map((r, i) => ({ r, t: i })) };
const SAMPLE_GAINS = [{ r: 'w', role: 'support', sr: 24 }, { r: 'l', role: 'support', sr: -18.5 }, { r: 'w', role: 'support', sr: 22 }, { r: 'w', role: 'damage', sr: 20 }, { r: 'l', role: 'tank', sr: -21 }];
const SAMPLE_OW = { name: 'Player', title: 'Data Broker', endorsement: 3, ranks: [{ role: 'support', division: 'gold', tier: 2 }, { role: 'damage', division: 'silver', tier: 4 }], games: 812, winrate: 51.3, kda: 2.9, hours: 340, heroes: [{ name: 'ana', hours: 96, winrate: 54.2, kda: 3.1 }, { name: 'lucio', hours: 50, winrate: 50, kda: 2.4 }] };

// ---------- widget table ----------
const W = {
  music: { label: 'Music', x: 24, y: 24, on: true, build: () => `
    <div class="music"><div class="disc-wrap"><div class="disc"></div><div class="cover"></div></div>
    <div class="info"><div class="bars"></div><div class="title"></div><div class="artist"></div><div class="prog"><i></i></div><div class="times"><span class="t0">0:00</span><span class="t1">0:00</span></div></div></div>`,
    active: () => cfg.music && ((media.ok && media.title) || editing) },
  rec: { label: "Today's record", x: 24, y: 160, on: true, build: () => '<div class="card rec"></div>', active: () => !!state.game || editing },
  last: { label: 'Last 5 games', x: 24, y: 330, on: true, build: () => '<div class="card last"></div>', active: () => !!state.game || editing },
  gain: { label: 'Role progress today', x: 300, y: 160, on: true, build: () => '<div class="card gain"></div>', active: () => (state.gains || []).length > 0 },
  ow: { label: 'Overwatch career', x: 24, y: 390, on: true, build: () => '<div class="card ow"></div>', active: () => cfg.stats && (!!owData || editing) },
  session: { label: 'Session timer', x: 24, y: 590, on: true, build: () => '<div class="card sess"></div>', active: () => !!state.session || editing },
  clock: { label: 'Clock', x: 24, y: 660, on: false, build: () => '<div class="card clock"></div>', active: () => true },
};
const stage = $('#stage');
for (const [id, w] of Object.entries(W)) {
  const el = document.createElement('div');
  el.className = 'w'; el.id = `w-${id}`; el.dataset.id = id;
  el.innerHTML = w.build();
  stage.appendChild(el);
  w.el = el;
}

const getL = (id) => ({ on: W[id].on, x: W[id].x, y: W[id].y, s: 1, o: 1, ...(layout[id] || {}) });

function place() {
  document.documentElement.style.setProperty('--a', cfg.accent || '#7c5cff');
  document.body.style.opacity = String((cfg.opacity || 100) / 100);
  for (const [id, w] of Object.entries(W)) {
    const l = getL(id);
    w.el.style.transform = `translate(${l.x}px, ${l.y}px) scale(${l.s})`;
    w.el.style.setProperty('--wo', l.o);
    w.el.classList.toggle('off', !l.on);
    const show = l.on && w.active();
    w.el.classList.toggle('show', editing ? true : show);
    w.el.classList.toggle('sel', editing && selected === id);
  }
  renderBar();
}

// ---------- music ----------
const N = 28;
const musicEl = W.music.el;
for (let i = 0; i < N; i++) $('.bars', musicEl).appendChild(document.createElement('i'));
const barEls = [...$('.bars', musicEl).children];

function paintMusic() {
  const m = editing && !media.ok ? SAMPLE_MEDIA : media;
  if (!m.ok) return;
  $('.title', musicEl).textContent = m.title;
  $('.artist', musicEl).textContent = m.artist || m.album || '';
  const img = thumb || coverUrl;
  $('.cover', musicEl).style.backgroundImage = img ? `url("${img}")` : 'linear-gradient(135deg, var(--a), var(--a2))';
  $('.disc', musicEl).style.setProperty('--lbl', img ? `url("${img}") center/cover` : 'var(--a)');
  $('.disc', musicEl).classList.toggle('play', !!m.playing);

}
// Where the song is right now. Windows only updates the position when the player reports it, so we add the time that has
// passed since that report. When the player gives no length or position at all (live streams, some browsers) we just count up from when the song started.
let trackKey = '', trackSeen = 0;
function songPos(m) {
  if (m.key !== trackKey) { trackKey = m.key; trackSeen = Date.now() - (m.pos || 0) * 1000; }
  const known = m.dur > 0 && (m.pos > 0 || m.upd);
  let pos;
  if (known) {
    pos = (m.pos || 0);
    if (m.playing) pos += ((Date.now() - (m.upd || m.at)) / 1000) * (m.rate || 1);
    // a stale report that puts us at (or past) the end while the song keeps going: fall back to counting from when we first saw it
    if (m.playing && pos > m.dur + 2) pos = (Date.now() - trackSeen) / 1000;
    pos = Math.min(Math.max(pos, 0), m.dur);
  } else pos = m.playing ? (Date.now() - trackSeen) / 1000 : (m.pos || 0);
  return pos;
}
setInterval(() => {
  const m = editing && !media.ok ? SAMPLE_MEDIA : media;
  if (!m.ok) return;
  const pos = m.key === undefined && editing ? 62 + (Date.now() % 60000) / 1000 : songPos(m);
  $('.prog i', musicEl).style.width = m.dur > 0 ? `${Math.min(100, (pos / m.dur) * 100)}%` : '0%';
  $('.t0', musicEl).textContent = fmt(pos);
  $('.t1', musicEl).textContent = m.dur > 0 ? fmt(m.dur) : '';
}, 250);

// bars: the PC's own sound output (loopback), analysed with an FFT
let analyser = null, data = null, fake = false;
(async function startAudio() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    stream.getVideoTracks().forEach((t) => t.stop());
    const ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.75;
    ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
    data = new Uint8Array(analyser.frequencyBinCount);
  } catch { fake = true; }
})();
const level = new Array(N).fill(0);
function frame(t) {
  requestAnimationFrame(frame);
  const m = editing && !media.ok ? SAMPLE_MEDIA : media;
  if (!m.ok || !cfg.bars || !W.music.el.classList.contains('show')) return;
  if (analyser) analyser.getByteFrequencyData(data);
  for (let i = 0; i < N; i++) {
    let v;
    if (analyser && !fake && media.ok) { const idx = Math.floor(Math.pow(i / N, 1.6) * (data.length * 0.75)) + 1; v = data[idx] / 255; }
    else v = m.playing ? 0.25 + 0.5 * Math.abs(Math.sin(t / 260 + i * 0.7)) * Math.abs(Math.sin(t / 900 + i)) : 0;
    level[i] += (v - level[i]) * 0.4;
    barEls[i].style.height = `${Math.max(3, level[i] * 44)}px`;
  }
}
requestAnimationFrame(frame);

// ---------- competitive record ----------
function paintRecord() {
  const s = editing && !state.game ? SAMPLE_STATE : state;
  const list = s.today || [];
  const w = list.filter((m) => m.r === 'w').length, l = list.filter((m) => m.r === 'l').length, d = list.filter((m) => m.r === 'd').length;
  const n = w + l;
  const wr = n ? Math.round((w / n) * 100) : null;
  let streak = 0, kind = '';
  for (let i = list.length - 1; i >= 0; i--) { if (!kind) kind = list[i].r; if (list[i].r === kind && kind !== 'd') streak++; else break; }
  const lossRun = (() => { let c = 0; for (let i = list.length - 1; i >= 0 && list[i].r === 'l'; i--) c++; return c; })();
  $('.rec', W.rec.el).innerHTML = `
    <div class="top"><span>Today · ${esc(s.game || 'game')}</span><span>${list.length} played</span></div>
    <div class="score"><span class="W">${w}W</span> – <span class="L">${l}L</span>${d ? ` <span class="D">${d}D</span>` : ''}</div>
    <div class="row"><span><b>${wr == null ? '–' : wr + '%'}</b> win rate</span>${streak > 1 ? `<span><b>${streak}${kind === 'w' ? '🔥' : '❄'}</b> ${kind === 'w' ? 'win' : 'loss'} streak</span>` : ''}</div>
    <div class="meter"><i class="gw" style="width:${n ? (w / n) * 100 : 0}%"></i><i class="gl" style="width:${n ? (l / n) * 100 : 0}%"></i></div>
    ${lossRun >= 3 ? '<div class="warn">3 losses in a row. Take a short break?</div>' : ''}`;
  const last = list.slice(-5);
  const cells = [];
  for (let i = 0; i < 5; i++) { const m = last[i - (5 - last.length)]; cells.push(m ? `<span class="pill p${m.r}">${m.r.toUpperCase()}</span>` : '<span class="pill e">-</span>'); }
  $('.last', W.last.el).innerHTML = `<small>Last 5</small>${cells.join('')}`;
}

// ---------- rank progress today, per role (percent) ----------
const ROLE_NAMES = [['tank', 'Tank'], ['damage', 'Damage'], ['support', 'Support'], ['', 'Other']];
const pctTxt = (v) => (v > 0 ? '+' : '') + (Math.round(v * 10) / 10) + '%';
function paintGain() {
  const list = editing && !(state.gains || []).length ? SAMPLE_GAINS : state.gains || [];
  const rows = ROLE_NAMES.map(([k, name]) => {
    const g = list.filter((m) => (m.role || '') === k);
    const w = g.filter((m) => m.r === 'w').length, l = g.filter((m) => m.r === 'l').length;
    const logged = g.filter((m) => m.sr != null);
    return { name, k, n: g.length, w, l, sum: logged.reduce((a, m) => a + m.sr, 0), has: logged.length > 0 };
  }).filter((r) => r.n && (r.k || r.has));
  const total = rows.reduce((a, r) => a + r.sum, 0);
  $('.gain', W.gain.el).innerHTML = `<div class="gtop"><span>Rank progress today</span><b class="${total > 0 ? 'up' : total < 0 ? 'down' : ''}">${rows.some((r) => r.has) ? pctTxt(total) : '–'}</b></div>` +
    (rows.map((r) => `<div class="grow"><span class="gn">${r.name}</span><span class="gr">${r.w}W ${r.l}L</span><b class="${r.sum > 0 ? 'up' : r.sum < 0 ? 'down' : ''}">${r.has ? pctTxt(r.sum) : '–'}</b></div>`).join('') || '<div class="grow"><span class="gn">No games yet</span></div>');
}

// ---------- Overwatch career ----------
function paintOw() {
  const p = editing && !owData ? SAMPLE_OW : owData;
  const el = $('.ow', W.ow.el);
  if (!p) { el.innerHTML = ''; return; }
  if (p.error) { el.innerHTML = `<h4>Overwatch <small>${esc(p.error)}</small></h4>`; return; }
  el.innerHTML = `<h4>${esc(p.name)} <small>${esc(p.title || '')}${p.endorsement ? ` · endorsement ${p.endorsement}` : ''}</small></h4>
    <div class="ranks">${(p.ranks || []).map((r) => `<span class="rank">${esc(r.role)} ${esc(r.division)} ${esc(r.tier)}</span>`).join('') || '<span class="rank">Unranked</span>'}</div>
    <div class="stats"><div><b>${p.winrate != null ? p.winrate + '%' : '–'}</b><span>win rate</span></div><div><b>${p.kda != null ? p.kda : '–'}</b><span>KDA</span></div><div><b>${p.games != null ? p.games : '–'}</b><span>games</span></div><div><b>${p.hours != null ? p.hours + 'h' : '–'}</b><span>played</span></div></div>
    ${(p.heroes || []).map((h) => `<div class="hero"><b>${esc(h.name)}</b><span>${h.hours}h · ${h.winrate}% · ${h.kda} KDA</span></div>`).join('')}`;
}

// ---------- session and clock ----------
function paintTime() {
  const s = editing && !state.session ? SAMPLE_STATE : state;
  const el = $('.sess', W.session.el);
  const ms = s.session ? Date.now() - s.session : 0;
  el.innerHTML = `<div><b>${hms(ms)}</b><span>this session</span></div><div><b>${(s.all || 0)}</b><span>games today</span></div>`;
  $('.clock', W.clock.el).textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(paintTime, 1000);

function paintAll() { paintMusic(); paintRecord(); paintGain(); paintOw(); paintTime(); place(); }

// ---------- messages from Nexus ----------
window.ov.on('cfg', (c) => { cfg = c; paintAll(); });
window.ov.on('layout', (l) => { layout = l || {}; place(); });
window.ov.on('state', (s) => { state = s; paintRecord(); paintGain(); paintTime(); place(); });
window.ov.on('media', (m) => { if (m.thumb !== undefined) { thumb = m.thumb; if (!thumb) coverUrl = ''; } media = m; paintMusic(); place(); });
window.ov.on('cover', (u) => { coverUrl = u; paintMusic(); });
window.ov.on('ow', (p) => { owData = p; paintOw(); place(); });
window.ov.on('edit', (on) => { editing = !!on; document.body.classList.toggle('edit', editing); if (!editing) selected = ''; paintAll(); });
window.ov.on('toast', (t) => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1800); });

// ---------- edit mode: drag, wheel, toolbar ----------
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => window.ov.saveLayout(Object.fromEntries(Object.keys(W).map((id) => [id, getL(id)]))), 250); };
const setL = (id, patch) => { layout[id] = { ...getL(id), ...patch }; place(); save(); };

let drag = null;
stage.addEventListener('pointerdown', (e) => {
  if (!editing) return;
  const el = e.target.closest('.w');
  if (!el) { selected = ''; place(); return; }
  const id = el.dataset.id, l = getL(id);
  selected = id;
  drag = { id, dx: e.clientX - l.x, dy: e.clientY - l.y };
  el.setPointerCapture(e.pointerId);
  place();
});
stage.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const l = getL(drag.id);
  const x = Math.min(innerWidth - 40, Math.max(-100, e.clientX - drag.dx)), y = Math.min(innerHeight - 40, Math.max(-20, e.clientY - drag.dy));
  W[drag.id].el.style.transform = `translate(${x}px, ${y}px) scale(${l.s})`;
  drag.x = x; drag.y = y;
});
stage.addEventListener('pointerup', () => { if (drag && drag.x != null) setL(drag.id, { x: Math.round(drag.x), y: Math.round(drag.y) }); drag = null; });
stage.addEventListener('wheel', (e) => {
  if (!editing) return;
  const el = e.target.closest('.w');
  if (!el) return;
  const id = el.dataset.id;
  selected = id;
  setL(id, { s: Math.min(3, Math.max(0.4, +(getL(id).s + (e.deltaY < 0 ? 0.05 : -0.05)).toFixed(2))) });
}, { passive: true });
window.addEventListener('keydown', (e) => { if (editing && e.key === 'Escape') window.ov.done(); });

function renderBar() {
  const bar = $('#bar');
  if (!editing) { bar.innerHTML = ''; return; }
  if (bar.contains(document.activeElement) && document.activeElement.type === 'range') return; // don't rebuild while a slider is being dragged
  const sel = selected && getL(selected);
  bar.innerHTML = `
    ${Object.entries(W).map(([id, w]) => `<label><input type="checkbox" data-on="${id}" ${getL(id).on ? 'checked' : ''}> ${esc(w.label)}</label>`).join('')}
    <span class="hint">${sel ? `${esc(W[selected].label)}: ` : 'Click a widget. '}</span>
    ${sel ? `<label>Size <input type="range" data-s min="0.4" max="3" step="0.05" value="${sel.s}"></label><label>Opacity <input type="range" data-o min="0.1" max="1" step="0.05" value="${sel.o}"></label>` : ''}
    <button data-reset>Reset layout</button><button class="primary" data-done>Done</button>
    <span class="hint">Drag a widget to move it, scroll over it to resize. Esc or Done to finish.</span>`;
}
$('#bar').addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.s !== undefined && selected) setL(selected, { s: Number(t.value) });
  if (t.dataset.o !== undefined && selected) setL(selected, { o: Number(t.value) });
});
$('#bar').addEventListener('change', (e) => { if (e.target.dataset.on) setL(e.target.dataset.on, { on: e.target.checked }); });
$('#bar').addEventListener('click', (e) => {
  if (e.target.closest('[data-done]')) window.ov.done();
  if (e.target.closest('[data-reset]')) { layout = {}; place(); save(); }
});

window.ov.ready();
