// Gacha helper: reset timers, stamina tracker, daily/weekly checklists and pity counters.
// Game data and the time maths live in shared/gacha-data.js (the `Gacha` object).

// The installed gacha games, one entry per game
function gachaGames() {
  const found = {};
  for (const it of items) {
    if (it.type !== 'game' || prefs.hidden.includes(it.id)) continue;
    const key = Gacha.keyFor(it);
    if (key && !found[key]) found[key] = it;
  }
  return Object.keys(Gacha.GAMES).filter((k) => found[k]).map((key) => ({ key, def: Gacha.GAMES[key], item: found[key] }));
}

const gState = (key) => (prefs.gacha && prefs.gacha[key]) || {};
const clockTime = (ms) => {
  const d = new Date(ms);
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return Math.abs(ms - Date.now()) > 20 * 3600000 ? `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${t}` : t;
};

function staminaMeta(sv) {
  if (!sv.known) return '';
  if (sv.full) return 'Full: spend some before it overflows';
  return `Full in ${Gacha.fmtDuration(sv.msToFull)} · at ${clockTime(sv.fullAt)}`;
}

function doneCount(key, type, per) {
  const st = gState(key);
  const tasks = Gacha.tasks(st, key, type);
  const done = (st.done && st.done[type]) || {};
  return { total: tasks.length, done: tasks.filter((t) => done[t.id] === per[type]).length };
}

// ----- Home strip: one compact card per installed gacha game -----
function gachaStripHtml() {
  const list = gachaGames();
  if (!list.length) return '';
  const now = Date.now();
  const per = Gacha.periods(now, prefs.settings.region);
  const next = Gacha.nextResets(now, prefs.settings.region);
  return `<div class="g-strip">${list.map(({ key, def, item }) => {
    const sv = Gacha.stamina(gState(key), def, now);
    const d = doneCount(key, 'daily', per);
    return `<div class="g-chip" data-goto="gacha" style="--gc:${def.color}" title="Open the Gacha helper">
      <div class="g-chip-name">${esc(def.name)}${isRunning(item.id) ? ' <span class="live-dot"></span>' : ''}</div>
      <div class="g-chip-row"><span>${esc(def.stamina.name)}</span><b>${sv.known ? `<span data-sv-key="${key}" data-sv-kind="val">${sv.value}</span>/${sv.max}` : 'not set'}</b></div>
      <div class="g-chip-bar"><span data-sv-key="${key}" data-sv-kind="bar" style="width:${sv.known ? (sv.value / sv.max) * 100 : 0}%"></span></div>
      <div class="g-chip-row"><span>Dailies</span><b>${d.done}/${d.total}</b></div>
      <div class="g-chip-row"><span>Reset in</span><b data-cd="${next.daily}">${Gacha.fmtDuration(next.daily - now)}</b></div>
      ${(() => { const b = Gacha.bannerInfo(gState(key), key, now); return b ? `<div class="g-chip-row"><span>Banner ends</span><b data-cd="${b.end}">${Gacha.fmtDuration(b.msLeft)}</b></div>` : ''; })()}
    </div>`;
  }).join('')}</div>`;
}

// ----- Banner timer + pull planner -----
const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const shortDateTime = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function bannerHtml(key, def, st, now) {
  const b = Gacha.bannerInfo(st, key, now);
  if (!b) return '';
  const plan = Gacha.pullPlan(st, def, key, now);
  const len = Gacha.PHASE_DAYS * Gacha.DAY;
  const pct = Math.max(0, Math.min(100, ((len - b.msLeft) / len) * 100));
  const enough = plan.byEnd >= plan.needed;
  const enoughToHard = plan.byEnd >= plan.toHard;
  return `
    <div class="g-banner">
      <div class="g-banner-top"><small>Banner ends · next one starts in</small><b data-cd="${b.end}">${Gacha.fmtDuration(b.msLeft)}</b></div>
      <div class="g-banner-bar"><span style="width:${pct}%"></span></div>
      <div class="g-banner-meta">${Math.max(0, Math.ceil(b.daysLeft))} day${Math.ceil(b.daysLeft) === 1 ? '' : 's'} left · ends ${shortDateTime(b.end)}<br>The one after that ends ${shortDateTime(b.nextEnd)}</div>
      <div class="s-input"><input type="datetime-local" data-gbanner value="${toLocalInput(b.end)}" title="When the current banner phase ends (your local time)"><button class="mini-btn accent" data-gop="bannerSet">Set</button>${b.custom ? '<button class="link" data-gop="bannerReset">use default</button>' : ''}</div>
      <div class="g-plan">
        <div class="g-tasks-head"><b>Pull planner</b></div>
        <div class="s-input"><label class="cap">pulls now <input type="number" class="mini-input" min="0" max="9999" value="${plan.pulls}" data-gpulls></label>
          <label class="cap" title="How many pulls you earn per day on average">per day <input type="number" class="mini-input" min="0" max="30" step="0.05" value="${plan.perDay}" data-gperday></label>
          <button class="mini-btn accent" data-gop="pullsSet">Save</button></div>
        <p class="g-plan-line">≈ <b>${plan.byEnd}</b> pulls by the end of this banner · ≈ <b>${plan.byNext}</b> by the next one</p>
        <p class="g-plan-line ${enough ? 'ok' : enoughToHard ? 'mid' : 'low'}">${enough ? '✔' : enoughToHard ? '◐' : '✖'} ${esc(plan.banner)}: ${plan.pity}/${plan.toHard + plan.pity} pity. ${enough ? `Covers a guaranteed 5★ (${plan.needed} pulls even if you lose the 50/50).` : enoughToHard ? `Covers hard pity (${plan.toHard}), but not a lost 50/50 (${plan.needed}). ${plan.needed - plan.byEnd} short.` : `${plan.toHard - plan.byEnd} short of hard pity (${plan.toHard}).`}</p>
      </div>
    </div>`;
}

// ----- The full page -----
function renderGacha() {
  const list = gachaGames();
  const region = prefs.settings.region;
  const regionSelect = `<select data-gregion>${Object.entries(Gacha.REGIONS).map(([k, r]) => `<option value="${k}"${k === region ? ' selected' : ''}>${r.label}</option>`).join('')}</select>`;
  if (!list.length) {
    content.innerHTML = `<h1 class="page-title">Gacha helper</h1>
      <div class="empty"><strong>No gacha games found</strong>Nexus looks for Honkai: Star Rail, Wuthering Waves, Genshin Impact and Zenless Zone Zero in your library.</div>`;
    return;
  }
  const now = Date.now();
  const per = Gacha.periods(now, region);
  const next = Gacha.nextResets(now, region);

  const cards = list.map(({ key, def, item }) => {
    const st = gState(key);
    const sv = Gacha.stamina(st, def, now);

    const stamina = sv.known ? `
      <div class="s-top"><div class="s-val"><b data-sv-key="${key}" data-sv-kind="val">${sv.value}</b><span>/ ${sv.max}</span></div>
        <small>${esc(def.stamina.name)}</small></div>
      <div class="sbar"><span data-sv-key="${key}" data-sv-kind="bar" style="width:${(sv.value / sv.max) * 100}%"></span></div>
      <div class="s-meta" data-sv-key="${key}" data-sv-kind="meta">${staminaMeta(sv)}</div>`
      : `<div class="s-top"><small>${esc(def.stamina.name)}</small></div><div class="s-meta">Enter your current amount to start tracking it.</div>`;

    const spend = sv.known ? `<div class="chips-row">${def.spend.map((a) => `<button class="mini-btn" data-gop="spend" data-amt="${a}" title="Spent ${a}">−${a}</button>`).join('')}<button class="mini-btn" data-gop="stamina" data-val="${sv.max}">Full</button></div>` : '';

    const taskList = (type, title) => {
      const tasks = Gacha.tasks(st, key, type);
      const done = (st.done && st.done[type]) || {};
      const n = tasks.filter((t) => done[t.id] === per[type]).length;
      return `<div class="g-tasks">
        <div class="g-tasks-head"><b>${title}</b><span>${n}/${tasks.length}</span>
          <span class="g-tasks-links"><button class="link" data-gop="checkAll" data-type="${type}" data-done="1">all</button><button class="link" data-gop="checkAll" data-type="${type}" data-done="0">clear</button></span></div>
        ${tasks.map((t) => `<label class="g-task${done[t.id] === per[type] ? ' done' : ''}"><input type="checkbox" data-gop="check" data-type="${type}" data-id="${esc(t.id)}"${done[t.id] === per[type] ? ' checked' : ''}><span>${esc(t.label)}</span><button class="g-x" data-gop="removeTask" data-type="${type}" data-id="${esc(t.id)}" title="Remove this task">×</button></label>`).join('')}
        <input class="g-add" data-gnew="${type}" placeholder="+ add a task" maxlength="60">
      </div>`;
    };

    const pity = def.banners.map((b) => {
      const p = (st.pity && st.pity[b.id]) || { count: 0, guaranteed: false };
      const pct = Math.min(100, (p.count / b.hard) * 100);
      return `<div class="pity" data-banner="${b.id}" data-count="${p.count}" data-guar="${p.guaranteed ? 1 : 0}">
        <div class="pity-head"><b>${esc(b.name)}</b><span class="${p.count >= b.soft ? 'hot' : ''}">${p.count} / ${b.hard}${p.count >= b.soft ? ' · soft pity' : ''}</span></div>
        <div class="pity-bar"><span style="width:${pct}%"></span><i style="left:${(b.soft / b.hard) * 100}%" title="Soft pity ~${b.soft}"></i></div>
        <div class="chips-row">
          <button class="mini-btn" data-gop="pityAdd" data-delta="-1">−1</button><button class="mini-btn" data-gop="pityAdd" data-delta="1">+1</button><button class="mini-btn" data-gop="pityAdd" data-delta="10">+10</button>
          ${b.guarantee ? `<button class="mini-btn win" data-gop="pityReset" data-guar="0" title="Got the featured 5★">5★ won</button><button class="mini-btn lose" data-gop="pityReset" data-guar="1" title="Lost the 50/50, next 5★ is guaranteed">5★ lost 50/50</button>` : `<button class="mini-btn win" data-gop="pityReset" data-guar="0">5★ got</button>`}
        </div>
        ${b.guarantee ? `<div class="pity-guar${p.guaranteed ? ' on' : ''}">${p.guaranteed ? '✔ Next 5★ is guaranteed featured' : 'Next 5★ is a 50/50'}</div>` : ''}
      </div>`;
    }).join('');

    return `
    <div class="g-card" data-gkey="${key}" style="--gc:${def.color}">
      <div class="g-head">
        <div class="g-art">${item.cover ? `<img src="${esc(item.cover)}" alt="" data-hide-self>` : ''}</div>
        <div class="g-title"><h2>${esc(def.name)}</h2>
          <div class="g-sub">${isRunning(item.id) ? `<span class="live-dot"></span> Playing now · <span data-since="${runningMap()[item.id]}"></span>` : prefs.recents[item.id] ? `Last played ${timeAgo(prefs.recents[item.id])}` : 'Not played yet'}${prefs.playtime && prefs.playtime[item.id] ? ` · ${fmtHours(playSeconds(item.id))} tracked` : ''}</div></div>
        <button class="play-btn small" data-gplay="${esc(item.id)}">${PLAY} Play</button>
      </div>
      <div class="g-grid">
        <div class="g-col">
          <div class="g-timers">
            <div class="g-timer"><small>Daily reset</small><b data-cd="${next.daily}">${Gacha.fmtDuration(next.daily - now)}</b></div>
            <div class="g-timer"><small>Weekly reset</small><b data-cd="${next.weekly}">${Gacha.fmtDuration(next.weekly - now)}</b></div>
          </div>
          ${bannerHtml(key, def, st, now)}
          <div class="stamina">${stamina}
            <div class="s-input"><input type="number" min="0" max="9999" placeholder="${sv.known ? 'new value' : 'current'}" data-gstamina><button class="mini-btn accent" data-gop="stamina">Set</button>
              <label class="cap" title="Change this if the game raises the cap">cap <input type="number" class="mini-input" min="1" max="9999" value="${sv.max}" data-gmax></label></div>
            ${spend}
          </div>
        </div>
        <div class="g-col">${taskList('daily', 'Daily')}${taskList('weekly', 'Weekly')}
          <div class="g-reset"><button class="link" data-gop="resetTasks">Reset task list to defaults</button></div></div>
        <div class="g-col"><div class="g-tasks-head"><b>Pity tracker</b></div>${pity}</div>
      </div>
    </div>`;
  }).join('');

  content.innerHTML = `
    <h1 class="page-title">Gacha helper</h1>
    <p class="page-sub">Resets at 04:00 server time · Server ${regionSelect} · Checklists clear themselves at reset</p>
    ${cards}`;
  tickLive();
}

async function gachaOp(key, op, payload) {
  prefs = await window.api.gacha(key, op, payload);
  render();
}

function initGachaUi() {
  content.addEventListener('click', (e) => {
    const t = e.target;
    const play = t.closest('[data-gplay]');
    if (play) return launch(play.dataset.gplay);
    const b = t.closest('[data-gop]');
    const card = b && b.closest('[data-gkey]');
    if (!b || !card) return;
    const key = card.dataset.gkey;
    const op = b.dataset.gop;
    if (op === 'check') return; // handled on change
    if (op === 'stamina') {
      const val = b.dataset.val !== undefined ? Number(b.dataset.val) : Number($('[data-gstamina]', card).value);
      if (b.dataset.val === undefined && $('[data-gstamina]', card).value === '') return $('[data-gstamina]', card).focus();
      return gachaOp(key, 'stamina', { value: val });
    }
    if (op === 'bannerSet') { const v = $('[data-gbanner]', card).value; const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? gachaOp(key, 'bannerEnd', { value: t }) : undefined; }
    if (op === 'bannerReset') return gachaOp(key, 'bannerEnd', { value: 0 });
    if (op === 'pullsSet') return gachaOp(key, 'pulls', { pulls: Number($('[data-gpulls]', card).value), perDay: $('[data-gperday]', card).value });
    if (op === 'spend') return gachaOp(key, 'spend', { amount: Number(b.dataset.amt) });
    if (op === 'checkAll') return gachaOp(key, 'checkAll', { type: b.dataset.type, done: b.dataset.done === '1' });
    if (op === 'removeTask') { e.preventDefault(); return gachaOp(key, 'removeTask', { type: b.dataset.type, id: b.dataset.id }); }
    if (op === 'resetTasks') return gachaOp(key, 'resetTasks');
    const pity = b.closest('.pity');
    if (pity && op === 'pityAdd') {
      const hard = Gacha.GAMES[key].banners.find((x) => x.id === pity.dataset.banner).hard;
      return gachaOp(key, 'pity', { banner: pity.dataset.banner, count: clamp(Number(pity.dataset.count) + Number(b.dataset.delta), 0, hard), guaranteed: pity.dataset.guar === '1' });
    }
    if (pity && op === 'pityReset') return gachaOp(key, 'pity', { banner: pity.dataset.banner, count: 0, guaranteed: b.dataset.guar === '1' });
  });

  content.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-gregion]')) { window.api.setSetting('region', t.value).then((p) => { prefs = p; render(); }); return; }
    const card = t.closest('[data-gkey]');
    if (!card) return;
    const key = card.dataset.gkey;
    if (t.matches('[data-gop="check"]')) gachaOp(key, 'check', { type: t.dataset.type, id: t.dataset.id, done: t.checked });
    if (t.matches('[data-gmax]')) gachaOp(key, 'max', { value: Number(t.value) });
  });

  content.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    const card = t.closest && t.closest('[data-gkey]');
    if (!card) return;
    if (t.matches('[data-gstamina]') && t.value !== '') gachaOp(card.dataset.gkey, 'stamina', { value: Number(t.value) });
    if (t.matches('[data-gnew]') && t.value.trim()) gachaOp(card.dataset.gkey, 'addTask', { type: t.dataset.gnew, label: t.value });
  });
}

// Runs every second: countdowns, live stamina, "playing for…" timers
function tickLive() {
  const now = Date.now();
  let resetPassed = false;
  for (const el of $$('[data-cd]')) {
    const left = Number(el.dataset.cd) - now;
    if (left < -1500) resetPassed = true;
    el.textContent = Gacha.fmtDuration(left);
  }
  for (const el of $$('[data-sv-key]')) {
    const key = el.dataset.svKey;
    const def = Gacha.GAMES[key];
    if (!def) continue;
    const sv = Gacha.stamina(gState(key), def, now);
    if (!sv.known) continue;
    const kind = el.dataset.svKind;
    if (kind === 'val') el.textContent = sv.value;
    else if (kind === 'bar') el.style.width = `${(sv.value / sv.max) * 100}%`;
    else if (kind === 'meta') el.textContent = staminaMeta(sv);
  }
  for (const el of $$('[data-since]')) el.textContent = fmtClock((now - Number(el.dataset.since)) / 1000);
  if (resetPassed && (view === 'gacha' || view === 'home') && !query) render(); // a reset just happened: refresh checklists
}
