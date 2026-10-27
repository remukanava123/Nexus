// Total hours (from Steam, the Overwatch profile or typed in) and Steam achievements, on a game's page.
const lifeOf = (id) => (prefs.lifetime || {})[id] || null;

// Hours in Nexus plus whatever happened before it: never less than what Nexus itself counted
function totalSeconds(id) {
  const nexus = playSeconds(id);
  const l = lifeOf(id);
  return l ? Math.max(l.sec, nexus) : nexus;
}

const LIFE_SOURCE = { steam: 'Steam', overwatch: 'your Overwatch profile', manual: 'you' };

// "632h played · 43h in Nexus"
function playedText(id) {
  const total = totalSeconds(id);
  const nexus = playSeconds(id);
  const l = lifeOf(id);
  if (l && total - nexus >= 600) return `${fmtHours(total)} played${nexus >= 60 ? ` · ${fmtHours(nexus)} in Nexus` : ''}`;
  return `${fmtHours(total)} played`;
}

// ---------- Hours line on the game page ----------
function hoursLineHtml(it) {
  if (it.type !== 'game' || prefs.settings.lifetimeHours === false) return '';
  const l = lifeOf(it.id);
  if (l) {
    return `<span>📈 <b>${fmtHours(l.sec)}</b> in total, from ${LIFE_SOURCE[l.src]}${playSeconds(it.id) >= 60 ? ` · ${fmtHours(playSeconds(it.id))} of it in Nexus` : ''}</span>
      <button class="link-btn" data-hours-edit>${l.src === 'manual' ? 'Change' : 'Use my own number'}</button>${l.src === 'manual' ? '<button class="link-btn" data-hours-clear>Remove</button>' : ''}`;
  }
  const ow = /overwatch/i.test(it.name) && !(prefs.settings.owTag || '').trim();
  return `<span class="muted">${ow ? 'Add your BattleTag in Settings to load your Overwatch hours, or ' : 'Played it before Nexus? '}</span><button class="link-btn" data-hours-edit>Add your hours</button>`;
}

function refreshHoursLine(id) {
  const el = document.getElementById('detailHours');
  const it = items.find((i) => i.id === id);
  if (el && it) el.innerHTML = hoursLineHtml(it);
}

document.getElementById('detail').addEventListener('click', async (e) => {
  const id = detailId;
  const it = items.find((i) => i.id === id);
  if (!it) return;
  const box = document.getElementById('detailHours');
  if (e.target.closest('[data-hours-edit]')) {
    const cur = lifeOf(id);
    box.innerHTML = `<input type="number" class="text-in" min="0" max="100000" step="0.1" id="hoursInput" placeholder="Hours" value="${cur ? Math.round(cur.sec / 360) / 10 : ''}" style="width:110px">
      <button class="btn small" data-hours-save>Save</button><button class="link-btn" data-hours-cancel>Cancel</button>
      <span class="muted">Your total hours in this game, including the ones Nexus counted.</span>`;
    box.querySelector('input').focus();
  } else if (e.target.closest('[data-hours-save]')) {
    prefs = await window.api.setHours(id, box.querySelector('input').value);
    refreshHoursLine(id);
    render();
  } else if (e.target.closest('[data-hours-clear]')) {
    prefs = await window.api.setHours(id, 0);
    refreshHoursLine(id);
    render();
  } else if (e.target.closest('[data-hours-cancel]')) {
    refreshHoursLine(id);
  }
});
document.getElementById('detail').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'hoursInput') document.querySelector('#detailHours [data-hours-save]').click();
  if (e.key === 'Escape' && e.target.id === 'hoursInput') { e.stopPropagation(); document.querySelector('#detailHours [data-hours-cancel]').click(); }
});

// ---------- Achievements ----------
const achCache = {};
const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

function achievementsHtml(a) {
  if (!a) return '';
  const pct = Math.round((a.unlocked / a.total) * 100);
  const done = a.list.filter((x) => x.done);
  const rare = done.filter((x) => x.percent !== null && x.percent < 10).sort((x, y) => x.percent - y.percent).slice(0, 3);
  const recent = [...done].sort((x, y) => y.time - x.time).slice(0, 3);
  const row = (x, extra = '') => `<div class="ach-item${x.done ? '' : ' locked'}">
      ${x.icon ? `<img src="${esc(x.icon)}" alt="" loading="lazy" data-hide-self>` : '<div class="ach-ph">🏆</div>'}
      <div><b>${esc(x.hidden && !x.done ? 'Hidden achievement' : x.name)}</b>
        <small>${esc(x.hidden && !x.done ? 'Keep playing to find out' : x.desc)}</small>
        <small class="ach-meta">${x.done && x.time ? `Unlocked ${when(x.time)}` : ''}${x.percent !== null ? `${x.done && x.time ? ' · ' : ''}${x.percent}% of players${x.percent < 5 ? ' · ultra rare' : ''}` : ''}${extra}</small></div>
    </div>`;
  const locked = a.list.filter((x) => !x.done).sort((x, y) => (y.percent ?? -1) - (x.percent ?? -1));
  return `<div class="ach">
    <h3>Achievements <span class="ach-count">${a.unlocked} / ${a.total}${a.unlocked === a.total ? ' · 100% 🎉' : ''}</span></h3>
    <div class="ach-bar"><span style="width:${pct}%"></span></div>
    ${rare.length ? `<h4>Your rarest</h4><div class="ach-list">${rare.map((x) => row(x)).join('')}</div>` : ''}
    ${recent.length ? `<h4>Most recent</h4><div class="ach-list">${recent.map((x) => row(x)).join('')}</div>` : ''}
    ${locked.length ? `<details class="ach-all"><summary>${locked.length} still locked${locked.some((x) => x.percent !== null) ? ' · easiest first' : ''}</summary><div class="ach-list scroll">${locked.map((x) => row(x)).join('')}</div></details>` : ''}
  </div>`;
}

async function loadAchievements(it) {
  if (it.type !== 'game' || it.source !== 'steam') return;
  const id = it.id;
  const a = await window.api.achievements(id).catch(() => null);
  achCache[id] = a;
  const el = document.getElementById('detailAch');
  if (detailId === id && el) el.innerHTML = achievementsHtml(a);
}
