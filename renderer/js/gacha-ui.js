// Gacha helper: the banners now and next, reset timers, stamina tracker, pity counters, and the things people look up.
// Game data and the time maths live in shared/gacha-data.js (the `Gacha` object); the banners come from src/gacha-banners.js.

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
const gBanners = (key) => (prefs.gachaBanners && prefs.gachaBanners[key]) || null;
const clockTime = (ms) => {
  const d = new Date(ms);
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return Math.abs(ms - Date.now()) > 20 * 3600000 ? `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${t}` : t;
};
const shortDateTime = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

let gachaSel = null; // the game shown on the page
let gachaRefreshing = false;

function staminaMeta(sv) {
  if (!sv.known) return '';
  if (sv.full) return 'Full: spend some before it overflows';
  return `Full in ${Gacha.fmtDuration(sv.msToFull)} · at ${clockTime(sv.fullAt)}`;
}

// When the banner you are on ends, from the real schedule: the character banner that is running, and the one after it
function gachaLive(key) {
  const d = gBanners(key);
  if (!d) return null;
  const cur = d.current.find((b) => b.kind === 'char' && b.end);
  if (!cur) return null;
  const nxt = (d.next || []).find((b) => b.kind === 'char' && b.end);
  return { start: cur.start, end: cur.end, nextEnd: nxt ? nxt.end : 0 };
}

// ----- Home strip: one compact card per installed gacha game -----
function gachaStripHtml() {
  const list = gachaGames();
  if (!list.length) return '';
  const now = Date.now();
  const next = Gacha.nextResets(now, prefs.settings.region);
  return `<div class="g-strip">${list.map(({ key, def, item }) => {
    const sv = Gacha.stamina(gState(key), def, now);
    const b = Gacha.bannerInfo(gState(key), key, now, gachaLive(key));
    const d = gBanners(key);
    const featured = d ? d.current.filter((x) => x.kind === 'char').flatMap((x) => x.featured.map((f) => f.name)).slice(0, 2).join(' · ') : '';
    return `<div class="g-chip" data-goto="gacha" data-gsel="${key}" style="--gc:${def.color}" title="Open the Gacha helper">
      <div class="g-chip-name">${esc(def.name)}${isRunning(item.id) ? ' <span class="live-dot"></span>' : ''}</div>
      <div class="g-chip-row"><span>${esc(def.stamina.name)}</span><b>${sv.known ? `<span data-sv-key="${key}" data-sv-kind="val">${sv.value}</span>/${sv.max}` : 'not set'}</b></div>
      <div class="g-chip-bar"><span data-sv-key="${key}" data-sv-kind="bar" style="width:${sv.known ? (sv.value / sv.max) * 100 : 0}%"></span></div>
      ${featured ? `<div class="g-chip-row"><span>Banner</span><b class="g-chip-feat">${esc(featured)}</b></div>` : ''}
      <div class="g-chip-row"><span>Reset in</span><b data-cd="${next.daily}">${Gacha.fmtDuration(next.daily - now)}</b></div>
      ${b ? `<div class="g-chip-row"><span>Banner ends</span><b data-cd="${b.end}">${Gacha.fmtDuration(b.msLeft)}</b></div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ----- Banners -----
const KIND_LABEL = { char: 'Character', weapon: 'Weapon', chronicled: 'Chronicled' };

function faceHtml(f) {
  return `<span class="gx-face" data-ch="${esc((f.name || '?')[0])}" title="${esc(f.name)}">${f.icon ? `<img src="${esc(f.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-hide-self>` : ''}</span>`;
}

// mode: 'now' (running, with a progress bar) or 'next' (starts later)
function bannerCardHtml(b, mode, now) {
  const names = b.featured.map((f) => f.name);
  const head = names.length ? names.join(' · ') : b.title;
  let when;
  if (b.start && b.end) {
    const approx = b.approx ? '~' : '';
    if (mode === 'now') {
      const len = Math.max(1, b.end - b.start);
      const pct = clamp(((now - b.start) / len) * 100, 0, 100);
      when = `<div class="gx-bar"><span style="width:${pct}%"></span></div>
        <div class="gx-when"><span>${shortDate(b.start)} – ${shortDate(b.end)}</span><b>${b.end > now ? `ends in <span data-cd="${b.end}">${Gacha.fmtDuration(b.end - now)}</span>` : 'switching to the next banner'}</b></div>`;
    } else {
      when = `<div class="gx-when"><span>${shortDate(b.start)} – ${shortDate(b.end)}</span><b>starts in <span data-cd="${b.start}">${approx}${Gacha.fmtDuration(b.start - now)}</span></b></div>`;
    }
  } else when = '<div class="gx-when"><span>Dates not announced yet</span></div>';
  const faces = b.featured.length ? `<div class="gx-faces">${b.featured.map(faceHtml).join('')}</div>` : '';
  const art = b.image
    ? `<div class="gx-art" style="background-image:${esc(cssUrl(b.image))}"></div>`
    : `<div class="gx-art plain">${faces}</div>`;
  return `<article class="gx-banner ${b.kind}${b.image ? ' has-img' : ''}">
    ${art}
    <div class="gx-binfo">
      <div class="gx-tags"><span class="gx-tag">${KIND_LABEL[b.kind] || 'Banner'}</span>${b.version ? `<span class="gx-tag soft">v${esc(b.version)}</span>` : ''}</div>
      <h4>${esc(head)}</h4>
      ${b.featured.length && b.title && b.title !== head && b.title !== names.join(' & ') ? `<div class="gx-sub">${esc(b.title)}</div>` : ''}
      ${b.image && faces ? faces : ''}
      ${b.extras && b.extras.length ? `<div class="gx-four">4★ ${b.extras.map((x) => esc(x.name)).join(', ')}</div>` : ''}
      ${when}
    </div>
  </article>`;
}

function bannerSectionHtml(key, now) {
  const d = gBanners(key);
  if (!d) return `<div class="gx-empty">${gachaRefreshing ? 'Looking up the banners…' : 'The banners could not be loaded yet. Check your connection and press Refresh.'}</div>`;
  const order = { char: 0, weapon: 1, chronicled: 2 };
  const sorted = (list) => list.slice().sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3));
  const cards = (list, mode) => `<div class="gx-banners">${sorted(list).map((b) => bannerCardHtml(b, mode, now)).join('')}</div>`;
  const next = d.next || [];
  return `
    <h3 class="gx-h">Current banner</h3>
    ${d.current.length ? cards(d.current, 'now') : '<div class="gx-empty">Nothing is running right now.</div>'}
    <h3 class="gx-h">Next banner</h3>
    ${next.length ? cards(next, 'next') : '<div class="gx-empty">The next banner has not been announced yet. It shows up here as soon as it is.</div>'}`;
}

// ----- Pull planner -----
function plannerHtml(key, def, st, now) {
  const live = gachaLive(key);
  const b = Gacha.bannerInfo(st, key, now, live);
  if (!b) return '';
  const plan = Gacha.pullPlan(st, def, key, now, live);
  const enough = plan.byEnd >= plan.needed;
  const enoughToHard = plan.byEnd >= plan.toHard;
  return `
    <div class="gx-card gx-plan">
      <h4>Pull planner</h4>
      <div class="s-input"><label class="cap">pulls now <input type="number" class="mini-input" min="0" max="9999" value="${plan.pulls}" data-gpulls></label>
        <label class="cap" title="How many pulls you earn per day on average">per day <input type="number" class="mini-input" min="0" max="30" step="0.05" value="${plan.perDay}" data-gperday></label>
        <button class="mini-btn accent" data-gop="pullsSet">Save</button></div>
      <p class="g-plan-line">≈ <b>${plan.byEnd}</b> pulls by the end of this banner · ≈ <b>${plan.byNext}</b> by the next one</p>
      <p class="g-plan-line ${enough ? 'ok' : enoughToHard ? 'mid' : 'low'}">${enough ? '✔' : enoughToHard ? '◐' : '✖'} ${esc(plan.banner)}: ${plan.pity}/${plan.toHard + plan.pity} pity. ${enough ? `Covers a guaranteed 5★ (${plan.needed} pulls even if you lose the 50/50).` : enoughToHard ? `Covers hard pity (${plan.toHard}), but not a lost 50/50 (${plan.needed}). ${plan.needed - plan.byEnd} short.` : `${plan.toHard - plan.byEnd} short of hard pity (${plan.toHard}).`}</p>
      ${live ? '<p class="g-plan-line">Banner dates come from the live schedule.</p>'
        : `<p class="g-plan-line">No live schedule, so this counts from the date you give: ends ${shortDateTime(b.end)}</p>
           <div class="s-input"><input type="datetime-local" data-gbanner value="${toLocalInput(b.end)}" title="When the current banner phase ends (your local time)"><button class="mini-btn accent" data-gop="bannerSet">Set</button>${b.custom ? '<button class="link" data-gop="bannerReset">use default</button>' : ''}</div>`}
    </div>`;
}

// ----- Good to know -----
const kvHtml = (rows) => `<dl class="gx-kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

function infoHtml(key, def, region, now) {
  const info = def.info;
  const reg = Gacha.REGIONS[region] || Gacha.REGIONS.europe;
  const next = Gacha.nextResets(now, region);
  const per = def.stamina.minutes;
  const full = Math.round((def.stamina.max * per) / 60 * 10) / 10;
  const search = (q) => `https://www.google.com/search?q=${encodeURIComponent(`${def.name} ${q}`)}`;
  const links = [...info.links, ...(info.codes ? [['Redeem codes', search('redeem codes')]] : [])];
  const looks = [['Tier list', 'tier list'], ['Best builds', 'best builds'], ['Interactive map', 'interactive map'], ['Next version release date', 'next version release date'], ['Event guides', 'events guide']];
  return `
    <h3 class="gx-h">Good to know</h3>
    <div class="gx-info">
      <div class="gx-card"><h4>About</h4>${kvHtml(info.about)}</div>
      <div class="gx-card"><h4>Pull rates</h4>${kvHtml(info.rates)}<p class="gx-fine">Rates are approximate and the games change them now and then.</p></div>
      <div class="gx-card"><h4>Pulls and currency</h4>${kvHtml(info.pull)}</div>
      <div class="gx-card"><h4>Resets and stamina</h4>${kvHtml([
        ['Daily reset', `04:00 server time (next in ${Gacha.fmtDuration(next.daily - now)})`],
        ['Weekly reset', `Monday 04:00 (next in ${Gacha.fmtDuration(next.weekly - now)})`],
        ['Your server', `${reg.label}, UTC${reg.offset >= 0 ? '+' : '−'}${Math.abs(reg.offset)}`],
        [def.stamina.name, `1 every ${per} min, cap ${def.stamina.max} (empty to full in ${full} h)`],
      ])}<p class="gx-fine">Servers: ${Gacha.SERVERS.map(([n, o]) => `${n} ${o}`).join(' · ')}</p></div>
      <div class="gx-card wide"><h4>How the pity works</h4><ul class="gx-list">${info.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><p class="gx-fine">${esc(info.cadence)}</p></div>
    </div>
    <h3 class="gx-h">Look it up</h3>
    <div class="gx-links">${links.map(([l, u]) => `<button class="gx-link" data-gurl="${esc(u)}">${esc(l)} <i>↗</i></button>`).join('')}
      ${looks.map(([l, q]) => `<button class="gx-link search" data-gurl="${esc(search(q))}" title="Searches Google">${esc(l)} <i>⌕</i></button>`).join('')}</div>`;
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
  if (!list.some((g) => g.key === gachaSel)) gachaSel = list[0].key;
  const { key, def, item } = list.find((g) => g.key === gachaSel);
  const now = Date.now();
  const next = Gacha.nextResets(now, region);
  const st = gState(key);
  const sv = Gacha.stamina(st, def, now);
  const d = gBanners(key);
  const live = gachaLive(key);
  const b = Gacha.bannerInfo(st, key, now, live);
  const heroImg = d && (d.current.find((x) => x.kind === 'char' && x.image) || {}).image;

  const tabs = list.map((g) => `<button class="gx-tab${g.key === key ? ' active' : ''}" data-gsel="${g.key}" style="--gc:${g.def.color}">
    <span class="gx-tab-art">${g.item.cover ? `<img src="${esc(g.item.cover)}" alt="" data-hide-self>` : ''}</span>${esc(g.def.name)}${isRunning(g.item.id) ? ' <span class="live-dot"></span>' : ''}</button>`).join('');

  const stamina = sv.known ? `
    <div class="s-top"><div class="s-val"><b data-sv-key="${key}" data-sv-kind="val">${sv.value}</b><span>/ ${sv.max}</span></div>
      <small>${esc(def.stamina.name)}</small></div>
    <div class="sbar"><span data-sv-key="${key}" data-sv-kind="bar" style="width:${(sv.value / sv.max) * 100}%"></span></div>
    <div class="s-meta" data-sv-key="${key}" data-sv-kind="meta">${staminaMeta(sv)}</div>`
    : `<div class="s-top"><small>${esc(def.stamina.name)}</small></div><div class="s-meta">Enter your current amount to start tracking it.</div>`;
  const spend = sv.known ? `<div class="chips-row">${def.spend.map((a) => `<button class="mini-btn" data-gop="spend" data-amt="${a}" title="Spent ${a}">−${a}</button>`).join('')}<button class="mini-btn" data-gop="stamina" data-val="${sv.max}">Full</button></div>` : '';

  const pity = def.banners.map((bn) => {
    const p = (st.pity && st.pity[bn.id]) || { count: 0, guaranteed: false };
    const pct = Math.min(100, (p.count / bn.hard) * 100);
    return `<div class="pity" data-banner="${bn.id}" data-count="${p.count}" data-guar="${p.guaranteed ? 1 : 0}">
      <div class="pity-head"><b>${esc(bn.name)}</b><span class="${p.count >= bn.soft ? 'hot' : ''}">${p.count} / ${bn.hard}${p.count >= bn.soft ? ' · soft pity' : ''}</span></div>
      <div class="pity-bar"><span style="width:${pct}%"></span><i style="left:${(bn.soft / bn.hard) * 100}%" title="Soft pity ~${bn.soft}"></i></div>
      <div class="chips-row">
        <button class="mini-btn" data-gop="pityAdd" data-delta="-1">−1</button><button class="mini-btn" data-gop="pityAdd" data-delta="1">+1</button><button class="mini-btn" data-gop="pityAdd" data-delta="10">+10</button>
        ${bn.guarantee ? `<button class="mini-btn win" data-gop="pityReset" data-guar="0" title="Got the featured 5★">5★ won</button><button class="mini-btn lose" data-gop="pityReset" data-guar="1" title="Lost the 50/50, next 5★ is guaranteed">5★ lost 50/50</button>` : `<button class="mini-btn win" data-gop="pityReset" data-guar="0">5★ got</button>`}
      </div>
      ${bn.guarantee ? `<div class="pity-guar${p.guaranteed ? ' on' : ''}">${p.guaranteed ? '✔ Next 5★ is guaranteed featured' : 'Next 5★ is a 50/50'}</div>` : ''}
    </div>`;
  }).join('');

  const status = isRunning(item.id) ? `<span class="live-dot"></span> Playing now · <span data-since="${runningMap()[item.id]}"></span>`
    : prefs.recents[item.id] ? `Last played ${timeAgo(prefs.recents[item.id])}` : 'Not played yet';
  const updated = d && d.at ? `Banners updated ${timeAgo(d.at)}` : '';

  content.innerHTML = `
    <div class="gx-top"><h1 class="page-title">Gacha helper</h1>
      <div class="gx-top-side"><span class="gx-upd">${updated}</span><button class="mini-btn" data-gop="refreshBanners"${gachaRefreshing ? ' disabled' : ''}>${gachaRefreshing ? 'Refreshing…' : '↻ Refresh'}</button>Server ${regionSelect}</div></div>
    <div class="gx-tabs">${tabs}</div>
    <section class="gx" data-gkey="${key}" style="--gc:${def.color}">
      <header class="gx-hero">
        <div class="gx-hero-bg"${heroImg ? ` style="background-image:${esc(cssUrl(heroImg))}"` : ''}></div>
        <div class="gx-hero-in">
          <div class="gx-cover">${item.cover ? `<img src="${esc(item.cover)}" alt="" data-hide-self>` : ''}</div>
          <div class="gx-hero-txt">
            <h2>${esc(def.name)}${d && d.version ? `<span class="gx-ver">Version ${esc(d.version)}</span>` : ''}</h2>
            <div class="g-sub">${status}${prefs.playtime && prefs.playtime[item.id] ? ` · ${fmtHours(playSeconds(item.id))} tracked` : ''}</div>
          </div>
          <button class="play-btn" data-gplay="${esc(item.id)}">${PLAY} Play</button>
        </div>
        <div class="gx-times">
          <div class="gx-time"><small>Daily reset</small><b data-cd="${next.daily}" data-reset>${Gacha.fmtDuration(next.daily - now)}</b></div>
          <div class="gx-time"><small>Weekly reset</small><b data-cd="${next.weekly}" data-reset>${Gacha.fmtDuration(next.weekly - now)}</b></div>
          ${b ? `<div class="gx-time"><small>Banner ends${live && live.end && gBanners(key) && gBanners(key).current.some((x) => x.approx) ? ' (approx.)' : ''}</small><b data-cd="${b.end}">${Gacha.fmtDuration(b.msLeft)}</b></div>` : ''}
        </div>
      </header>
      ${bannerSectionHtml(key, now)}
      <h3 class="gx-h">Your progress</h3>
      <div class="gx-prog">
        <div class="gx-card"><h4>${esc(def.stamina.name)}</h4><div class="stamina">${stamina}
          <div class="s-input"><input type="number" min="0" max="9999" placeholder="${sv.known ? 'new value' : 'current'}" data-gstamina><button class="mini-btn accent" data-gop="stamina">Set</button>
            <label class="cap" title="Change this if the game raises the cap">cap <input type="number" class="mini-input" min="1" max="9999" value="${sv.max}" data-gmax></label></div>
          ${spend}</div></div>
        <div class="gx-card"><h4>Pity tracker</h4>${pity}</div>
        ${plannerHtml(key, def, st, now)}
      </div>
      ${infoHtml(key, def, region, now)}
    </section>`;
  tickLive();
}

async function gachaOp(key, op, payload) {
  prefs = await window.api.gacha(key, op, payload);
  render();
}

async function gachaRefresh() {
  if (gachaRefreshing) return;
  gachaRefreshing = true;
  if (view === 'gacha') render();
  try { prefs = await window.api.gachaRefresh(); } catch {}
  gachaRefreshing = false;
  if (view === 'gacha' || view === 'home') render();
}

function initGachaUi() {
  content.addEventListener('click', (e) => {
    const t = e.target;
    const play = t.closest('[data-gplay]');
    if (play) return launch(play.dataset.gplay);
    const url = t.closest('[data-gurl]');
    if (url) return window.api.openExternal(url.dataset.gurl);
    const tab = t.closest('.gx-tab[data-gsel]');
    if (tab) { gachaSel = tab.dataset.gsel; return render(); }
    const chip = t.closest('.g-chip[data-gsel]'); // a card on Home: open the page on that game
    if (chip) { gachaSel = chip.dataset.gsel; if (view === 'gacha') render(); return; } // (Home's own handler switches the page)
    const b = t.closest('[data-gop]');
    if (b && b.dataset.gop === 'refreshBanners') return gachaRefresh();
    const card = b && b.closest('[data-gkey]');
    if (!b || !card) return;
    const key = card.dataset.gkey;
    const op = b.dataset.gop;
    if (op === 'stamina') {
      const val = b.dataset.val !== undefined ? Number(b.dataset.val) : Number($('[data-gstamina]', card).value);
      if (b.dataset.val === undefined && $('[data-gstamina]', card).value === '') return $('[data-gstamina]', card).focus();
      return gachaOp(key, 'stamina', { value: val });
    }
    if (op === 'bannerSet') { const v = $('[data-gbanner]', card).value; const ms = v ? new Date(v).getTime() : NaN; return Number.isFinite(ms) ? gachaOp(key, 'bannerEnd', { value: ms }) : undefined; }
    if (op === 'bannerReset') return gachaOp(key, 'bannerEnd', { value: 0 });
    if (op === 'pullsSet') return gachaOp(key, 'pulls', { pulls: Number($('[data-gpulls]', card).value), perDay: $('[data-gperday]', card).value });
    if (op === 'spend') return gachaOp(key, 'spend', { amount: Number(b.dataset.amt) });
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
    if (t.matches('[data-gmax]')) gachaOp(card.dataset.gkey, 'max', { value: Number(t.value) });
  });

  content.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    const card = t.closest && t.closest('[data-gkey]');
    if (!card) return;
    if (t.matches('[data-gstamina]') && t.value !== '') gachaOp(card.dataset.gkey, 'stamina', { value: Number(t.value) });
  });
}

// Runs every second: countdowns, live stamina, "playing for…" timers
function tickLive() {
  const now = Date.now();
  let resetPassed = false;
  for (const el of $$('[data-cd]')) {
    const left = Number(el.dataset.cd) - now;
    if (left < -1500 && el.hasAttribute('data-reset')) resetPassed = true; // (a banner whose end has passed just says "now" until the schedule updates)
    const text = Gacha.fmtDuration(left);
    el.textContent = el.textContent.startsWith('~') ? `~${text}` : text;
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
  if (resetPassed && (view === 'gacha' || view === 'home') && !query) render(); // a reset just happened: refresh the timers
}
