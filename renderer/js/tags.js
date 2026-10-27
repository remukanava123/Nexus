// Custom tags on games: shown as filter chips on the Games page and edited on each game's page
const SUGGESTED_TAGS = ['Playing', 'Finished', 'Dropped', 'Wishlist', 'Co-op', 'Multiplayer', 'Singleplayer', 'Chill', 'Grinding', 'Story', 'Competitive', 'Gacha'];
const tagFilter = new Set();

const tagsOf = (id) => (prefs.tags && prefs.tags[id]) || [];

// tag -> how many of these games have it
function tagCounts(list) {
  const counts = new Map();
  for (const g of list) for (const t of tagsOf(g.id)) counts.set(t, (counts.get(t) || 0) + 1);
  return counts;
}

const allTagNames = () => [...new Set(Object.values(prefs.tags || {}).flat())];

// Reuse the capitalisation of an existing tag ("co-op" -> "Co-op"), otherwise just capitalise the first letter
function canonicalTag(raw) {
  const t = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!t) return '';
  const known = [...allTagNames(), ...SUGGESTED_TAGS].find((k) => k.toLowerCase() === t.toLowerCase());
  return known || t[0].toUpperCase() + t.slice(1);
}

function tagFilterHtml(gamesList) {
  const counts = tagCounts(gamesList);
  for (const t of [...tagFilter]) if (!counts.has(t)) tagFilter.delete(t); // a tag nobody has any more
  if (!counts.size) return '';
  const chips = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t, n]) => `<button class="chip tag${tagFilter.has(t) ? ' active' : ''}" data-tagfilter="${esc(t)}"># ${esc(t)} · ${n}</button>`).join('');
  return `<div class="chips tag-chips"><span class="chips-label">Tags</span>${chips}${tagFilter.size ? '<button class="chip clear" data-tagclear>✕ clear</button>' : ''}</div>`;
}

const matchesTags = (id) => [...tagFilter].every((t) => tagsOf(id).includes(t));

// The editor on a game's page
function tagEditorHtml(it) {
  const mine = tagsOf(it.id);
  const picks = [...new Set([...allTagNames(), ...SUGGESTED_TAGS])].filter((t) => !mine.includes(t)).slice(0, 10);
  return `<span class="tags-label">Tags</span>
    ${mine.map((t) => `<span class="tag-pill">${esc(t)}<button class="tag-x" data-tagdel="${esc(t)}" title="Remove tag">×</button></span>`).join('')}
    <input class="tag-input" data-taginput placeholder="${mine.length ? '+ tag' : '+ add a tag (Enter)'}" maxlength="24" list="tagList">
    <datalist id="tagList">${[...new Set([...allTagNames(), ...SUGGESTED_TAGS])].map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
    ${mine.length < 12 && picks.length ? `<span class="tag-suggest">${picks.map((t) => `<button class="tag-pick" data-tagadd="${esc(t)}">+ ${esc(t)}</button>`).join('')}</span>` : ''}`;
}

async function saveTags(id, list) {
  const lib = await window.api.setPref('tags', id, list);
  if (lib) { items = lib.items; prefs = lib.prefs; }
  const box = $('.detail-tags', detail);
  if (box && detailId === id) box.innerHTML = tagEditorHtml(items.find((i) => i.id === id));
  if (view === 'games') render();
}

// Wired up once; the detail panel and the Games page are re-rendered a lot, so everything is delegated
function initTags() {
  detail.addEventListener('click', (e) => {
    const del = e.target.closest('[data-tagdel]');
    const add = e.target.closest('[data-tagadd]');
    if (!del && !add) return;
    const id = detailId;
    if (!id) return;
    const cur = tagsOf(id);
    saveTags(id, del ? cur.filter((t) => t !== del.dataset.tagdel) : [...cur, add.dataset.tagadd]);
  });
  detail.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-noadmin]') || !detailId) return;
    const lib = await window.api.setPref('noAdmin', detailId, e.target.checked);
    if (lib) { items = lib.items; prefs = lib.prefs; }
    toast(e.target.checked ? 'This game will start without the admin prompt' : 'This game will ask for admin rights as usual');
  });
  detail.addEventListener('keydown', (e) => {
    if (!e.target.matches('[data-taginput]')) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); return; }
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const t = canonicalTag(e.target.value);
    if (!t || !detailId) return;
    const cur = tagsOf(detailId);
    if (!cur.some((x) => x.toLowerCase() === t.toLowerCase())) saveTags(detailId, [...cur, t]);
    else e.target.value = '';
  });
  content.addEventListener('click', (e) => {
    const f = e.target.closest('[data-tagfilter]');
    if (f) { const t = f.dataset.tagfilter; tagFilter.has(t) ? tagFilter.delete(t) : tagFilter.add(t); render(); sfx.play('select'); return; }
    if (e.target.closest('[data-tagclear]')) { tagFilter.clear(); render(); }
  });
}
