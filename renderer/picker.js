// "What should I play?": a slot-machine style random game picker
const picker = { filter: 'all', fair: true, excluded: new Set(), winner: null, spinning: false, timer: 0 };
const pickerEl = () => $('#picker');
const pickerOpen = () => !pickerEl().hidden;

function pickerPool() {
  let pool = items.filter((i) => i.type === 'game' && !prefs.hidden.includes(i.id) && !picker.excluded.has(i.id));
  const f = picker.filter;
  if (f === 'unplayed') pool = pool.filter((i) => playSeconds(i.id) < 60 && !prefs.recents[i.id]);
  else if (f === 'favorites') pool = pool.filter((i) => isFav(i.id));
  else if (f === 'short') pool = pool.filter((i) => playSeconds(i.id) < 5 * 3600);
  else if (f.startsWith('src:')) pool = pool.filter((i) => i.source === f.slice(4));
  return pool;
}

// Games you've played less get a better chance (when "fair" is on)
function weightedPick(pool) {
  const w = pool.map((g) => (picker.fair ? 1 / (1 + playSeconds(g.id) / 7200) : 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

function openPicker() {
  closeMenu();
  picker.excluded.clear();
  picker.winner = null;
  unfade(pickerEl());
  sfx.play('open');
  renderPicker();
  spin();
}
function closePicker() { clearTimeout(picker.timer); picker.spinning = false; fadeHide(pickerEl(), 200); }

function renderPicker() {
  const sources = [...new Set(items.filter((i) => i.type === 'game').map((i) => i.source))];
  const chips = [['all', 'Any game'], ['unplayed', 'Never played'], ['favorites', 'Favourites'], ['short', 'Under 5h'], ...sources.map((s) => [`src:${s}`, SOURCES[s] || s])];
  pickerEl().innerHTML = `
    <div class="picker-box">
      <button class="detail-close" data-pk="close" title="Close (Esc)" style="position:absolute;top:14px;right:14px;margin:0">✕</button>
      <h2>What should I play?</h2>
      <div class="chips">${chips.map(([k, label]) => `<button class="chip${picker.filter === k ? ' active' : ''}" data-pk-filter="${k}">${esc(label)}</button>`).join('')}</div>
      <label class="check-row"><input type="checkbox" id="pkFair"${picker.fair ? ' checked' : ''}> Favour games I've played less</label>
      <div class="slot"><div class="slot-marker"></div><div class="slot-strip" id="slotStrip"></div></div>
      <div class="pick-result" id="pickResult"></div>
    </div>`;
}

function slotCard(g) {
  return `<div class="slot-card" data-slot="${esc(g.id)}">${g.cover ? `<img src="${esc(g.cover)}" alt="" data-fallback="${esc(g.coverFallback || '')}"><template>${placeholder(g)}</template>` : placeholder(g)}</div>`;
}

function spin() {
  if (picker.spinning) return;
  const pool = pickerPool();
  const strip = $('#slotStrip');
  const result = $('#pickResult');
  if (!strip) return;
  if (!pool.length) {
    strip.innerHTML = '';
    result.innerHTML = '<div class="empty small"><strong>Nothing matches that filter</strong>Try “Any game”.</div>';
    return;
  }
  const winner = weightedPick(pool);
  picker.winner = winner;
  picker.spinning = true;
  result.innerHTML = '<div class="pick-hint">Spinning…</div>';

  const N = 44, WIN = 36;
  const seq = [];
  for (let i = 0; i < N; i++) {
    let g = i === WIN ? winner : pool[(Math.random() * pool.length) | 0];
    if (pool.length > 1 && seq.length && g.id === seq[seq.length - 1].id && i !== WIN) g = pool[(pool.indexOf(g) + 1) % pool.length];
    seq.push(g);
  }
  strip.style.transition = 'none';
  strip.style.transform = 'translateX(0)';
  strip.innerHTML = seq.map(slotCard).join('');
  void strip.offsetWidth; // restart the animation from the left
  const cardW = 150 + 14;
  const target = WIN * cardW + 75 - strip.parentElement.clientWidth / 2 + (Math.random() * 50 - 25);
  const noAnim = document.body.classList.contains('no-anim');
  strip.style.transition = noAnim ? 'none' : 'transform 4.8s cubic-bezier(.1,.6,.1,1)';
  strip.style.transform = `translateX(${-target}px)`;
  picker.timer = setTimeout(reveal, noAnim ? 50 : 5000);
}

function reveal() {
  picker.spinning = false;
  const g = picker.winner;
  const strip = $('#slotStrip');
  if (!g || !strip) return;
  $$('.slot-card.win', strip).forEach((c) => c.classList.remove('win'));
  const card = $$('.slot-card', strip)[36];
  if (card) card.classList.add('win');
  const sec = playSeconds(g.id);
  $('#pickResult').innerHTML = `
    <div class="pick-name">${esc(g.name)}</div>
    <div class="pick-meta">${SOURCES[g.source] || ''} · ${sec >= 60 ? `${fmtHours(sec)} played` : 'never played'}${prefs.recents[g.id] ? ` · last ${timeAgo(prefs.recents[g.id])}` : ''}</div>
    <div class="pick-actions">
      <button class="play-btn" data-pk="play">${PLAY} Play ${esc(g.name.length > 24 ? 'it' : g.name)}</button>
      <button class="btn" data-pk="again">🎲 Spin again</button>
      <button class="btn" data-pk="skip" title="Take it out of the pool and spin again">Not this one</button>
      <button class="btn" data-pk="details">Details</button>
    </div>`;
  sfx.play('select');
  fx.burst(innerWidth / 2, innerHeight * 0.42, 70);
}

function initPicker() {
  const el = pickerEl();
  el.addEventListener('mousedown', (e) => { if (e.target === el) closePicker(); });
  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-pk-filter]');
    if (f) { picker.filter = f.dataset.pkFilter; picker.spinning = false; clearTimeout(picker.timer); renderPicker(); return spin(); }
    const b = e.target.closest('[data-pk]');
    if (!b) return;
    const g = picker.winner;
    const act = b.dataset.pk;
    if (act === 'close') return closePicker();
    if (act === 'again' && !picker.spinning) return spin();
    if (act === 'skip' && g && !picker.spinning) { picker.excluded.add(g.id); return spin(); }
    if (act === 'play' && g) { closePicker(); return launch(g.id); }
    if (act === 'details' && g) { closePicker(); return openDetail(g.id); }
  });
  el.addEventListener('change', (e) => { if (e.target.id === 'pkFair') picker.fair = e.target.checked; });
}
