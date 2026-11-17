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

// Every gacha game, for the page itself: one you don't have still shows its banners, resets and planner (no Play button).
// `item` is null for those.
function gachaAllGames() {
  const have = {};
  for (const g of gachaGames()) have[g.key] = g.item;
  return Object.keys(Gacha.GAMES).map((key) => ({ key, def: Gacha.GAMES[key], item: have[key] || null }));
}
// A small picture for a game without a library cover: a character from its current banner
function gachaFaceIcon(key) {
  const d = prefs.gachaBanners && prefs.gachaBanners[key];
  const f = d && d.current.flatMap((b) => b.featured || []).find((x) => x.icon);
  return f ? f.icon : '';
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

// One entry per featured item: { b, f }. A banner with nothing featured gives one entry with f = null (its picture and title).
// Characters and weapons are kept apart so each gets its own grid.
function gxEntries(list) {
  const out = { chars: [], weapons: [] };
  const seen = new Set();
  for (const b of list || []) {
    const feats = b.featured && b.featured.length ? b.featured : [null];
    for (const f of feats) {
      const id = `${b.kind}|${f ? f.name : b.title}`;
      if (seen.has(id)) continue;
      seen.add(id);
      (b.kind === 'weapon' ? out.weapons : out.chars).push({ b, f });
    }
  }
  const nm = (e) => (e.f ? e.f.name : e.b.title) || '';
  const by = (a, c) => (a.b.end || 0) - (c.b.end || 0) || nm(a).localeCompare(nm(c));
  out.chars.sort(by);
  out.weapons.sort(by);
  return out;
}

// Cards per row so no row is left with an orphan: 5 -> 3+2, 7 -> 4+3. Returns one "per" value per card (all of 1-4 divide 12).
function gxSpans(n) {
  const rows = Math.ceil(n / 4);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const per = base + (r < extra ? 1 : 0);
    for (let i = 0; i < per; i++) out.push(per);
  }
  return out;
}

// mode: 'now' (running, with a progress bar) or 'next' (starts later)
function gxCardHtml(e, mode, now, per, key) {
  const { b, f } = e;
  const def = Gacha.GAMES[key] || {};
  const art = f && f.splash ? f.splash : f && f.icon ? f.icon : !f ? b.image : '';
  const fit = f && f.splash ? (f.splashFit === 'cover' ? 'fit-cover' : 'fit-cutout') : f && f.icon ? 'fit-icon' : b.image ? 'fit-banner' : 'fit-none';
  const ec = ((Gacha.ELEMENT_COLORS || {})[f && f.element]) || def.color || '#8b8bff';
  const name = f ? f.name : b.title;
  const click = f && b.kind !== 'weapon';
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
  const sub = f ? (f.sub || (b.title && b.title !== f.name ? b.title : '')) : '';
  // A full picture that fails to load falls back to the cut-out (splashAlt, drawn as a cut-out), then to the icon
  const alt = f && f.splash && f.splashAlt && f.splashAlt !== f.splash ? f.splashAlt : '';
  const fb = alt || (f && f.icon && art !== f.icon ? f.icon : '');
  const img = art
    ? `<img class="gx-fc-art" src="${esc(art)}" ${fb ? `data-fallback="${esc(fb)}"${alt ? ' data-fallback-fit="fit-cutout"' : ''}` : 'data-hide-self'} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '';
  const sp = fit === 'fit-cover' && f && /^\d{1,3}% \d{1,3}%$/.test(f.splashPos || '') ? `;--sp:${f.splashPos}` : '';
  return `<article class="gx-fc ${b.kind} ${mode} ${fit}${click ? ' is-click' : ''}" data-per="${per}" style="grid-column:span ${12 / per};--ec:${esc(ec)}${sp}"${click ? ` data-gchar="${esc(f.name)}" role="button" tabindex="0" title="Tier and builds"` : ''}>
    ${img}
    <div class="gx-fc-shade"></div>
    <div class="gx-fc-info">
      <div class="gx-tags"><span class="gx-tag">${esc(b.kind === 'weapon' && def.weaponLabel ? def.weaponLabel.replace(/s$/, '') : KIND_LABEL[b.kind] || 'Banner')}</span>${b.version ? `<span class="gx-tag soft">v${esc(b.version)}</span>` : ''}${f && f.element ? `<span class="gx-tag el">${esc(f.element)}</span>` : ''}</div>
      ${f ? `<div class="gx-stars">${'★'.repeat(f.rarity || 5)}</div>` : ''}
      <h4>${esc(name)}</h4>
      ${sub ? `<div class="gx-sub">${esc(sub)}</div>` : ''}
      ${per <= 2 && b.extras && b.extras.length ? `<div class="gx-four">4★ ${b.extras.map((x) => esc(x.name)).join(', ')}</div>` : ''}
      ${when}
    </div>
  </article>`;
}

function gxGroupHtml(label, entries, mode, now, key) {
  if (!entries.length) return '';
  const spans = gxSpans(entries.length);
  return `<div class="gx-group-label">${esc(label)}</div>
    <div class="gx-cards" style="--n:${entries.length}">${entries.map((e, i) => gxCardHtml(e, mode, now, spans[i], key)).join('')}</div>`;
}

function bannerSectionHtml(key, now) {
  const d = gBanners(key);
  if (!d) return `<div class="gx-empty">${gachaRefreshing ? 'Looking up the banners…' : 'The banners could not be loaded yet. Check your connection and press Refresh.'}</div>`;
  const def = Gacha.GAMES[key] || {};
  const section = (list, mode) => {
    const e = gxEntries(list);
    return gxGroupHtml('Characters', e.chars, mode, now, key) + gxGroupHtml(def.weaponLabel || 'Weapons', e.weapons, mode, now, key);
  };
  const next = d.next || [];
  return `
    <h3 class="gx-h">Current banner</h3>
    ${d.current.length ? section(d.current, 'now') : '<div class="gx-empty">Nothing is running right now.</div>'}
    <h3 class="gx-h">Next banner</h3>
    ${next.length ? section(next, 'next') : '<div class="gx-empty">The next banner has not been announced yet. It shows up here as soon as it is.</div>'}`;
}

// ----- Backdrop: soft colour blobs, the version's key art, a big faint version number -----
// The random picks are kept so the colours do not jump on every render(); they are re-rolled when the game changes or the page is entered.
let gxBgRoll = null;
let gxPopToken = 0;

function gxBgHtml(key, def, d, entered) {
  if (!gxBgRoll || gxBgRoll.key !== key || entered) {
    const pal = (def.palette && def.palette.length ? def.palette : [def.color]).slice();
    for (let i = pal.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pal[i], pal[j]] = [pal[j], pal[i]]; }
    const pos = () => `${5 + Math.round(Math.random() * 85)}%`;
    gxBgRoll = { key, c: [pal[0], pal[1 % pal.length], pal[2 % pal.length]], p: [pos(), `${8 + Math.round(Math.random() * 12)}%`, pos(), `${42 + Math.round(Math.random() * 16)}%`, pos(), `${80 + Math.round(Math.random() * 12)}%`] }; // y spread top / middle / bottom so the whole page is coloured
  }
  const r = gxBgRoll;
  let art = d && d.art;
  if (!art && d) {
    const ch = gxEntries(d.current).chars.find((e) => e.f && e.f.splash && e.f.splashFit === 'cover');
    art = ch ? ch.f.splash : (d.current.find((x) => x.image) || {}).image;
  }
  const vars = `--c1:${esc(r.c[0])};--c2:${esc(r.c[1])};--c3:${esc(r.c[2])};--x1:${r.p[0]};--y1:${r.p[1]};--x2:${r.p[2]};--y2:${r.p[3]};--x3:${r.p[4]};--y3:${r.p[5]}`;
  return `<div class="gx-bg" style="${vars}" aria-hidden="true">
    ${art ? `<div class="gx-bg-art" style="background-image:${esc(cssUrl(art))}"></div>` : ''}
    <div class="gx-bg-glow"></div>
    <div class="gx-bg-mark">${esc((d && d.version) || def.name || '')}</div>
  </div>`;
}

// ----- Character popup (in the shared #modal) -----
const gxTierClass = (label) => `t${String(label).toLowerCase().replace(/[^a-z0-9]/g, '')}`;

function gxFindEntry(key, name) {
  const d = gBanners(key);
  if (!d) return null;
  for (const list of [d.current, d.next || []]) {
    const hit = gxEntries(list).chars.find((e) => e.f && e.f.name === name);
    if (hit) return hit;
  }
  return null;
}

function gxBuildHtml(r, key, name) {
  const def = Gacha.GAMES[key] || {};
  const search = `<button class="gx-link search" data-gurl="${esc(`https://www.google.com/search?q=${encodeURIComponent(`${def.name} ${name} build`)}`)}">Search builds <i>⌕</i></button>`;
  if (!r || !r.ok) {
    const msg = {
      unsupported: 'No build details for this game.',
      off: 'Build look-ups are off (Settings → Advanced).',
      notfound: 'Prydwen.gg has no page for this character yet.',
      offline: "Couldn't reach Prydwen.gg. Check your connection.",
    }[r && r.reason] || "Couldn't load the build details.";
    return `<p class="gx-fine">${esc(msg)}</p><div>${search}</div>`;
  }
  const list = (arr, fmt) => arr && arr.length ? `<ul>${arr.map(fmt).join('')}</ul>` : '';
  // Pick rate from Prydwen ("88.87%"): a number plus a thin bar, so the best choice stands out at a glance
  const pct = (p) => {
    const n = parseFloat(p);
    return p ? `<span class="gx-pct"><i>${esc(p)}</i>${Number.isFinite(n) ? `<u style="width:${clamp(n, 0, 100)}%"></u>` : ''}</span>` : '';
  };
  // Icons and 2-piece / 4-piece text come from the main process (StarRailRes); with the old shape they are simply missing
  const ic = (src) => (src ? `<img class="gx-ic" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-hide-self>` : '<span class="gx-ic ph"></span>');
  // One row: icon(s), name(s), pick rate. A row with effect text gets a tooltip (see gxTipShow). Every game sends the same shape.
  const row = (x) => {
    const ps = x.parts || [];
    const fx = ps.filter((p) => p.fx && p.fx.length).map((p) => ({ n: p.name, fx: p.fx }));
    const pcs = ps.length === 1 ? ps[0].fx.filter((f) => /-piece$/.test(f[0])) : [];
    const pieces = ps.length > 1 ? '2 + 2 piece' : pcs.length ? `${pcs.map((f) => f[0].replace('-piece', '')).join(' / ')} piece` : '';
    const small = [x.sub, pieces].filter(Boolean).join(' · ');
    return `<li class="gx-set${fx.length ? ' has-fx' : ''}"${fx.length ? ` data-fx="${esc(JSON.stringify(fx))}" tabindex="0"` : ''}>
      <span class="gx-ics">${ps.map((p) => (p.icon || !ps.some((q) => q.icon) ? ic(p.icon) : '')).join('')}</span>
      <span class="gx-nm"><span>${ps.map((p) => esc(p.name)).join(' <em>+</em> ')}</span>${small || fx.length ? `<small>${esc(small)}</small>` : ''}</span>
      ${pct(x.pct)}</li>`;
  };
  const tiers = (r.tiers || []).filter((t) => t.ratings && t.ratings.length).map((t) => `<div class="gx-pop-tiers" title="${esc(t.role || '')}">${t.role ? `<span class="gx-fine">${esc(t.role)}</span>` : ''}${t.ratings.map(([l, v]) => `<div class="gx-tier ${gxTierClass(v)}"><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}</div>`).join('');
  const sections = (r.sections || []).filter((s) => s.rows && s.rows.length).map((s) => `<div class="gx-pop-row"><h5>${esc(s.title)}</h5>${list(s.rows, row)}</div>`).join('');
  const stats = (r.stats || []).filter((x) => x[1]);
  return `${tiers}
    ${sections}
    ${stats.length ? `<dl class="gx-pop-stats">${stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${!tiers && !sections && !stats.length ? '<p class="gx-fine">Prydwen.gg has no build details for this character yet.</p>' : ''}
    <div>${search}</div>`;
}

// ----- Hover trailer and relic tooltip -----
// The official trailer plays muted behind a card while the mouse rests on it. The video id comes from the game's
// wiki (main process, cached); an embed that cannot play just never fades in, and the card looks as before.
const gxTrailerCache = new Map(); // "key|name" -> Promise<id or ''>
let gxVid = null; // the one video that is playing: { host, timer, frame }

function gxTrailerId(key, name) {
  const k = `${key}|${name}`;
  if (!gxTrailerCache.has(k)) {
    let p;
    try { p = Promise.resolve(window.api.gachaTrailer(key, name)).then((r) => (r && r.ok ? r.id : ''), () => ''); } catch { p = Promise.resolve(''); }
    gxTrailerCache.set(k, p);
  }
  return gxTrailerCache.get(k);
}

function gxTrailerOk() {
  const b = document.body.classList;
  return !b.contains('perf') && !b.contains('no-anim') && !(prefs.settings && prefs.settings.gachaBuilds === false) && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function gxTrailerStop() {
  if (!gxVid) return;
  clearTimeout(gxVid.timer);
  clearTimeout(gxVid.giveUp);
  if (gxVid.off) gxVid.off();
  if (gxVid.frame) gxVid.frame.remove();
  gxVid = null;
}

// host: the element to draw into (it needs position:relative/absolute and overflow hidden)
function gxTrailerStart(host, key, name, delay = 550) {
  gxTrailerStop();
  if (!gxTrailerOk()) return;
  const me = { host, frame: null, timer: 0 };
  gxVid = me;
  me.timer = setTimeout(async () => {
    const id = await gxTrailerId(key, name);
    if (gxVid !== me || !id || !host.isConnected) return;
    const w = host.clientWidth, h = host.clientHeight;
    // Cover the host: a 16:9 picture scaled so both sides are filled, centred
    const fw = Math.max(w, (h * 16) / 9), fh = (fw * 9) / 16;
    const f = document.createElement('iframe');
    f.className = 'gx-vid';
    f.setAttribute('allow', 'autoplay; encrypted-media');
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    f.tabIndex = -1;
    f.style.cssText = `width:${Math.ceil(fw)}px;height:${Math.ceil(fh)}px`;
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&rel=0&playsinline=1&modestbranding=1&start=8&loop=1&enablejsapi=1&playlist=${encodeURIComponent(id)}`;
    // The frame's own load event also fires for YouTube's error page, so wait for the player to say it is playing
    // (and drop the frame if it reports an error or says nothing for a while)
    const onMsg = (ev) => {
      if (ev.source !== f.contentWindow) return;
      let d; try { d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; } catch { return; }
      if (!d) return;
      if (d.event === 'onError') return gxTrailerStop();
      const state = d.event === 'onStateChange' ? d.info : d.info && d.info.playerState;
      if (state === 1 && gxVid === me) f.classList.add('on');
    };
    window.addEventListener('message', onMsg);
    me.off = () => window.removeEventListener('message', onMsg);
    f.addEventListener('load', () => { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch { /* frame already gone */ } });
    me.giveUp = setTimeout(() => { if (gxVid === me && !f.classList.contains('on')) gxTrailerStop(); }, 9000);
    me.frame = f;
    host.appendChild(f);
  }, delay);
}

// One floating tip for every relic row: the popup scrolls, so a tip inside it would be clipped
let gxTipEl = null;
function gxTipShow(li) {
  let fx;
  try { fx = JSON.parse(li.dataset.fx || '[]'); } catch { return; }
  if (!fx.length) return;
  if (!gxTipEl) { gxTipEl = document.createElement('div'); gxTipEl.className = 'gx-tip'; document.body.appendChild(gxTipEl); }
  gxTipEl.innerHTML = fx.map((p) => `<div class="gx-tip-set"><b>${esc(p.n)}</b>${p.fx.map(([l, t]) => `<p><span>${esc(l)}</span>${esc(t)}</p>`).join('')}</div>`).join('');
  gxTipEl.hidden = false;
  const r = li.getBoundingClientRect();
  const tw = gxTipEl.offsetWidth, th = gxTipEl.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  let y = r.top - th - 8;
  if (y < 8) y = r.bottom + 8; // no room above: go below
  x = clamp(x, 8, window.innerWidth - tw - 8);
  gxTipEl.style.left = `${Math.round(x)}px`;
  gxTipEl.style.top = `${Math.round(y)}px`;
}
function gxTipHide() { if (gxTipEl) gxTipEl.hidden = true; }

function gxOpenChar(key, name) {
  const def = Gacha.GAMES[key] || {};
  const hit = gxFindEntry(key, name);
  const f = (hit && hit.f) || { name };
  const b = hit && hit.b;
  const ec = ((Gacha.ELEMENT_COLORS || {})[f.element]) || def.color || '#8b8bff';
  // The header wants the character on its own (the wide key art has the name written on it already)
  const art = f.splashAlt || f.splash || f.icon || '';
  const on =!prefs.settings || prefs.settings.gachaBuilds !== false;
  const token = ++gxPopToken;
  gxTrailerStop(); // the card's trailer ends when the popup opens
  gxTipHide();
  modalBody.innerHTML = `<div class="gx-pop" style="--gc:${esc(def.color || '#8b8bff')};--ec:${esc(ec)}">
    <div class="gx-pop-head" data-gk="${esc(key)}" data-gn="${esc(name)}">
      ${art ? `<img class="gx-pop-art" src="${esc(art)}" ${f.icon && art !== f.icon ? `data-fallback="${esc(f.icon)}"` : 'data-hide-self'} alt="" decoding="async" referrerpolicy="no-referrer">` : ''}
      <div>
        <div class="gx-tags"><span class="gx-tag">${esc(def.name || '')}</span>${b && b.version ? `<span class="gx-tag soft">v${esc(b.version)}</span>` : ''}${f.element ? `<span class="gx-tag el">${esc(f.element)}</span>` : ''}</div>
        <h3>${esc(name)}</h3>
        ${f.sub ? `<div class="gx-sub">${esc(f.sub)}</div>` : ''}
      </div>
      <button class="gx-pop-x" data-gpop-close aria-label="Close">×</button>
    </div>
    <div class="gx-pop-body">${on ? '<div class="gx-pop-load"><div class="spinner"></div>Looking up builds…</div>' : gxBuildHtml({ ok: false, reason: 'off' }, key, name)}</div>
    <div class="gx-pop-foot"><span class="gx-fine"${on ? '' : ' hidden'}>From Prydwen.gg</span></div>
  </div>`;
  unfade(modal);
  const x = $('[data-gpop-close]', modalBody);
  if (x) x.focus();
  if (!on) return;
  const done = (r) => {
    if (token !== gxPopToken || modal.hidden) return; // closed, or another character opened since: do not paint stale data
    const body = $('.gx-pop-body', modalBody);
    const foot = $('.gx-pop-foot', modalBody);
    if (!body || !foot) return;
    body.innerHTML = gxBuildHtml(r, key, name);
    if (r && r.ok) {
      const when = r.updated ? ` · updated ${shortDate(r.updated)}` : '';
      foot.innerHTML = `<span class="gx-fine">From ${esc(r.source || 'Prydwen.gg')}${when}</span>${r.url ? `<button class="gx-link" data-gurl="${esc(r.url)}">Open on Prydwen <i>↗</i></button>` : ''}`;
    } else foot.innerHTML = '';
  };
  let p;
  try { p = Promise.resolve(window.api.gachaBuild(key, name)); } catch { p = Promise.resolve({ ok: false, reason: 'offline' }); }
  p.then(done, () => done({ ok: false, reason: 'offline' }));
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
  const list = gachaAllGames();
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
  const heroImg = d && (d.art || (d.current.find((x) => x.kind === 'char' && x.image) || {}).image);
  const entered = !content.querySelector('.gx-bg'); // the page was just opened (or the game list was empty before)

  const tabs = list.map((g) => `<button class="gx-tab${g.key === key ? ' active' : ''}" data-gsel="${g.key}" style="--gc:${g.def.color}">
    <span class="gx-tab-art">${(g.item && g.item.cover) || gachaFaceIcon(g.key) ? `<img src="${esc((g.item && g.item.cover) || gachaFaceIcon(g.key))}" alt="" data-hide-self>` : ''}</span>${esc(g.def.name)}${g.item && isRunning(g.item.id) ? ' <span class="live-dot"></span>' : ''}</button>`).join('');

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

  const cover = (item && item.cover) || gachaFaceIcon(key);
  const status = !item ? 'Not in your library'
    : isRunning(item.id) ? `<span class="live-dot"></span> Playing now · <span data-since="${runningMap()[item.id]}"></span>`
    : prefs.recents[item.id] ? `Last played ${timeAgo(prefs.recents[item.id])}` : 'Not played yet';
  const updated = d && d.at ? `Banners updated ${timeAgo(d.at)}` : '';

  content.innerHTML = `
    ${gxBgHtml(key, def, d, entered)}
    <div class="gx-top"><h1 class="page-title">Gacha helper</h1>
      <div class="gx-top-side"><span class="gx-upd">${updated}</span><button class="mini-btn" data-gop="refreshBanners"${gachaRefreshing ? ' disabled' : ''}>${gachaRefreshing ? 'Refreshing…' : '↻ Refresh'}</button>Server ${regionSelect}</div></div>
    <div class="gx-tabs">${tabs}</div>
    <section class="gx" data-gkey="${key}" style="--gc:${def.color}">
      <header class="gx-hero">
        <div class="gx-hero-bg"${heroImg ? ` style="background-image:${esc(cssUrl(heroImg))}"` : ''}></div>
        <div class="gx-hero-in">
          <div class="gx-cover">${cover ? `<img src="${esc(cover)}" alt="" data-hide-self>` : ''}</div>
          <div class="gx-hero-txt">
            <h2>${esc(def.name)}${d && d.version ? `<span class="gx-ver">Version ${esc(d.version)}</span>` : ''}</h2>
            <div class="g-sub">${status}${item && prefs.playtime && prefs.playtime[item.id] ? ` · ${fmtHours(playSeconds(item.id))} tracked` : ''}</div>
          </div>
          ${item ? `<button class="play-btn" data-gplay="${esc(item.id)}">${PLAY} Play</button>` : ''}
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
  // The popup lives in #modal, outside #content, so it needs its own listener
  modalBody.addEventListener('click', (e) => {
    if (!e.target.closest('.gx-pop')) return;
    const url = e.target.closest('[data-gurl]');
    if (url) return window.api.openExternal(url.dataset.gurl);
    if (e.target.closest('[data-gpop-close]')) closeModal();
  });
  // Relic tooltips and the header trailer inside the popup
  modalBody.addEventListener('pointerover', (e) => {
    const set = e.target.closest && e.target.closest('.gx-set.has-fx');
    if (set && !set.contains(e.relatedTarget)) gxTipShow(set);
    const head = e.target.closest && e.target.closest('.gx-pop-head[data-gk]');
    if (head && !head.contains(e.relatedTarget) && e.pointerType !== 'touch') gxTrailerStart(head, head.dataset.gk, head.dataset.gn, 700);
  });
  modalBody.addEventListener('pointerout', (e) => {
    const set = e.target.closest && e.target.closest('.gx-set.has-fx');
    if (set && !set.contains(e.relatedTarget)) gxTipHide();
    const head = e.target.closest && e.target.closest('.gx-pop-head[data-gk]');
    if (head && !head.contains(e.relatedTarget)) gxTrailerStop();
  });
  modalBody.addEventListener('focusin', (e) => { const set = e.target.closest && e.target.closest('.gx-set.has-fx'); if (set) gxTipShow(set); });
  modalBody.addEventListener('focusout', gxTipHide);

  // Trailer behind a banner card while the mouse rests on it
  content.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const card = e.target.closest && e.target.closest('.gx-fc[data-gchar]');
    if (!card || card.contains(e.relatedTarget)) return;
    const gk = card.closest('[data-gkey]');
    if (gk) gxTrailerStart(card, gk.dataset.gkey, card.dataset.gchar);
  });
  content.addEventListener('pointerout', (e) => {
    const card = e.target.closest && e.target.closest('.gx-fc[data-gchar]');
    if (card && !card.contains(e.relatedTarget) && gxVid && gxVid.host === card) gxTrailerStop();
  });

  // Backdrop height: the sticky .gx-bg needs the visible height of the scrolling page in pixels
  const setVh = () => content.style.setProperty('--gx-vh', `${content.clientHeight}px`);
  setVh();
  if (window.ResizeObserver) new ResizeObserver(setVh).observe(content);

  // Card tilt (3D hover): delegated, because renderGacha rebuilds the cards. Throttled to one update per frame.
  let gxTiltCard = null, gxTiltRaf = 0, gxTiltEv = null;
  const gxTiltOff = (card) => { if (!card) return; for (const v of ['--rx', '--ry', '--px', '--py']) card.style.removeProperty(v); };
  const gxTiltOn = () => !document.body.classList.contains('no-anim') && !document.body.classList.contains('perf') && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const gxTiltApply = () => {
    gxTiltRaf = 0;
    const e = gxTiltEv, card = gxTiltCard;
    if (!e || !card || !card.isConnected) return;
    const r = card.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
    card.style.setProperty('--ry', `${((x - 0.5) * 14).toFixed(1)}deg`);
    card.style.setProperty('--rx', `${((0.5 - y) * 14).toFixed(1)}deg`);
    card.style.setProperty('--px', ((x - 0.5) * 2).toFixed(2));
    card.style.setProperty('--py', ((y - 0.5) * 2).toFixed(2));
  };
  content.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || !gxTiltOn()) return;
    const card = e.target.closest && e.target.closest('.gx-fc.is-click');
    if (card !== gxTiltCard) { gxTiltOff(gxTiltCard); gxTiltCard = card; }
    if (!card) return;
    gxTiltEv = e;
    if (!gxTiltRaf) gxTiltRaf = requestAnimationFrame(gxTiltApply);
  });
  content.addEventListener('pointerleave', () => { gxTiltOff(gxTiltCard); gxTiltCard = null; });

  content.addEventListener('click', (e) => {
    const t = e.target;
    const play = t.closest('[data-gplay]');
    if (play) return launch(play.dataset.gplay);
    const url = t.closest('[data-gurl]');
    if (url) return window.api.openExternal(url.dataset.gurl);
    const ch = t.closest('[data-gchar]');
    if (ch) { const gk = ch.closest('[data-gkey]'); if (gk) return gxOpenChar(gk.dataset.gkey, ch.dataset.gchar); }
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
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t.matches && t.matches('[data-gchar]')) {
      e.preventDefault();
      const gk = t.closest('[data-gkey]');
      if (gk) gxOpenChar(gk.dataset.gkey, t.dataset.gchar);
      return;
    }
    if (e.key !== 'Enter') return;
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
