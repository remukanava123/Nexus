// The welcome guide (first run) and the "What's new" note (once after an update).
const onboard = document.getElementById('onboard');
let onboardStep = 0;

const closeOnboard = () => { onboard.hidden = true; onboard.innerHTML = ''; };
const toggleHtml = (key, label, desc) => `<div class="ob-row"><div><b>${esc(label)}</b><small>${esc(desc)}</small></div><button class="switch${prefs.settings[key] ? ' on' : ''}" role="switch" aria-checked="${!!prefs.settings[key]}" data-ob-set="${key}"></button></div>`;

function welcomeStep() {
  const games = items.filter((i) => i.type === 'game');
  const apps = items.filter((i) => i.type === 'app');
  const bySource = {};
  for (const g of games) bySource[g.source] = (bySource[g.source] || 0) + 1;
  const dots = [0, 1, 2].map((i) => `<i class="${i === onboardStep ? 'on' : ''}"></i>`).join('');
  let body = '';
  if (onboardStep === 0) {
    body = `<div class="ob-hero">👋</div><h1>Welcome to Nexus</h1>
      <p class="ob-lead">All your games, apps and websites in one place.</p>
      <div class="ob-found"><b>${games.length}</b> games and <b>${apps.length}</b> apps found on this PC</div>
      <div class="ob-chips">${Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<span style="--c:var(--${s})"><i></i>${esc(SOURCES[s] || s)} · ${n}</span>`).join('')}</div>
      <p class="ob-small">Missing something? Nexus looks again every time it opens, and Settings has a Rescan button.</p>`;
  } else if (onboardStep === 1) {
    const hasOw = games.some((g) => /overwatch/i.test(g.name));
    body = `<h1>Make it yours</h1><p class="ob-lead">You can change all of this later in Settings.</p>
      <div class="theme-grid ob-themes">${Object.entries(THEMES).map(([k, t]) => `<button class="theme-swatch${k === prefs.settings.theme ? ' active' : ''}" data-ob-theme="${k}" style="--a:${t.bg};--b:${t.s1};--c:${t.s3}"><i></i><span>${t.label}</span></button>`).join('')}</div>
      ${toggleHtml('trackPlaytime', 'Count my playtime', 'Nexus notices when a game is running and keeps the hours')}
      ${toggleHtml('lifetimeHours', 'Show hours I played before Nexus', 'Read from Steam on this PC. Other launchers don’t share theirs, but you can type a number in on a game’s page')}
      ${toggleHtml('startWithWindows', 'Start quietly when I sign in', 'Lives in the tray so playtime counts from the start')}
      ${toggleHtml('checkUpdates', 'Tell me when a new version is out', 'Checks GitHub now and then. Nothing is installed without you')}
      ${hasOw ? `<div class="ob-row"><div><b>Your Overwatch BattleTag</b><small>Optional. Loads your career hours and stats (profile must be public)</small></div><input class="text-in" id="obTag" placeholder="Name#1234" value="${esc(prefs.settings.owTag || '')}" spellcheck="false" style="width:170px"></div>` : ''}`;
  } else {
    body = `<div class="ob-hero">🚀</div><h1>You’re all set</h1>
      <div class="ob-tips">
        <div><kbd>${esc(prettyAccel(prefs.settings.hotkey))}</kbd> shows or hides Nexus from anywhere</div>
        <div><kbd>Ctrl</kbd> + <kbd>R</kbd> picks a game for you when you can’t decide</div>
        <div><kbd>F11</kbd> opens big-screen mode for a controller</div>
        <div>Just start typing to search</div>
        <div>Open a game’s page to see its hours, achievements and news</div>
      </div>
      <p class="ob-small" style="margin-top:18px">Nexus was made by Claude, an AI assistant from Anthropic.</p>`;
  }
  onboard.innerHTML = `<div class="ob-card">
    <div class="ob-body">${body}</div>
    <div class="ob-foot"><button class="link-btn" data-ob="skip">${onboardStep === 2 ? '' : 'Skip'}</button><div class="ob-dots">${dots}</div>
      <div>${onboardStep > 0 ? '<button class="btn" data-ob="back">Back</button> ' : ''}<button class="play-btn small" data-ob="next">${onboardStep === 2 ? 'Open Nexus' : 'Next'}</button></div></div></div>`;
}

async function finishWelcome() {
  const tag = document.getElementById('obTag');
  if (tag && tag.value.trim() !== (prefs.settings.owTag || '')) await saveSetting('owTag', tag.value.trim());
  await saveSetting('welcomeDone', true);
  closeOnboard();
  window.api.whatsNewSeen(); // a fresh install has nothing new to read
}

onboard.addEventListener('click', async (e) => {
  const step = e.target.closest('[data-ob]');
  const sw = e.target.closest('[data-ob-set]');
  const theme = e.target.closest('[data-ob-theme]');
  if (sw) { await saveSetting(sw.dataset.obSet, !prefs.settings[sw.dataset.obSet]); sw.classList.toggle('on', prefs.settings[sw.dataset.obSet]); sw.setAttribute('aria-checked', String(!!prefs.settings[sw.dataset.obSet])); return; }
  if (theme) { await saveSetting('theme', theme.dataset.obTheme); const tag = document.getElementById('obTag'); const v = tag && tag.value; welcomeStep(); if (v) document.getElementById('obTag').value = v; return; }
  if (!step) return;
  const act = step.dataset.ob;
  if (act === 'skip') return finishWelcome();
  if (act === 'back') { onboardStep -= 1; return welcomeStep(); }
  if (act === 'next') {
    if (onboardStep === 2) return finishWelcome();
    const tag = document.getElementById('obTag');
    if (tag && tag.value.trim() !== (prefs.settings.owTag || '')) await saveSetting('owTag', tag.value.trim());
    onboardStep += 1;
    welcomeStep();
  }
});

function showWelcome() {
  onboardStep = 0;
  onboard.hidden = false;
  welcomeStep();
}

// ---------- What's new ----------
function showWhatsNew(n) {
  onboard.hidden = false;
  onboard.innerHTML = `<div class="ob-card wide">
    <div class="ob-body"><small class="ob-ver">Nexus ${esc(n.version)}${n.from ? ` · updated from ${esc(n.from)}` : ''}</small><h1>${esc(n.title || 'What’s new')}</h1>
      <div class="ob-news">${(n.items || []).map(([icon, title, text]) => `<div><span>${icon}</span><div><b>${esc(title)}</b><small>${esc(text)}</small></div></div>`).join('')}</div></div>
    <div class="ob-foot"><button class="link-btn" data-ob-link>All releases ↗</button><div></div><button class="play-btn small" data-ob-done>Got it</button></div></div>`;
  const done = () => { closeOnboard(); window.api.whatsNewSeen(); onboard.removeEventListener('click', onClick); };
  const onClick = (e) => {
    if (e.target.closest('[data-ob-done]')) done();
    else if (e.target.closest('[data-ob-link]')) window.api.openExternal('https://github.com/remukanava123/Nexus/releases');
  };
  onboard.addEventListener('click', onClick);
}

// Called once the library is on screen
async function startOnboarding() {
  if (!prefs.settings.welcomeDone) return showWelcome();
  const n = await window.api.whatsNew().catch(() => null);
  if (n) showWhatsNew(n);
}

onboard.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !onboard.hidden && !prefs.settings.welcomeDone) e.stopPropagation(); });

// ---------- "Update available" banner on the Home page ----------
// state: null (nothing new), or { version, url, canInstall, phase: 'idle' | 'downloading' | 'installing' | 'error', pct, error }
let updateState = null;

function updateBannerHtml() {
  const u = updateState;
  if (!u) return '';
  let right;
  if (u.phase === 'downloading') right = `<div class="ub-prog"><div class="ub-bar"><span style="width:${u.pct || 0}%"></span></div><small>Downloading… ${u.pct || 0}%</small></div>`;
  else if (u.phase === 'installing') right = '<small>Installing. Nexus will close and open again by itself…</small>';
  else right = `<button class="play-btn small" data-update-now>${u.canInstall ? 'Update now' : 'Open download page'}</button>`;
  const sub = u.phase === 'error' ? `<span class="ub-err">${esc(u.error)}</span>` : u.canInstall ? 'Nexus downloads the installer, runs it, and opens again. Your library and settings stay.' : 'Download the installer from the release page.';
  return `<div class="update-banner" id="updateBanner"><div class="ub-icon">⬆️</div><div class="ub-text"><b>Update available · Nexus ${esc(u.version)}</b><small>${sub}</small></div><div class="ub-act">${right}</div></div>`;
}

window.api.on('update:available', (info) => {
  updateState = info ? { ...info, phase: 'idle' } : null;
  if (view === 'home') render();
});
window.api.on('update:progress', (pct) => {
  if (!updateState) return;
  updateState.phase = 'downloading'; updateState.pct = pct;
  const el = document.getElementById('updateBanner');
  if (el) el.outerHTML = updateBannerHtml();
});
window.api.updateStatus().then((info) => { if (info) { updateState = { ...info, phase: 'idle' }; if (view === 'home') render(); } }).catch(() => {});

document.getElementById('content').addEventListener('click', async (e) => {
  if (!e.target.closest('[data-update-now]') || !updateState) return;
  if (!updateState.canInstall) { window.api.openExternal(updateState.url); return; }
  updateState.phase = 'downloading'; updateState.pct = 0;
  document.getElementById('updateBanner').outerHTML = updateBannerHtml();
  const r = await window.api.installUpdate();
  if (r.ok) updateState.phase = 'installing';
  else { updateState.phase = 'error'; updateState.error = r.error || 'The update failed'; }
  const el = document.getElementById('updateBanner');
  if (el) el.outerHTML = updateBannerHtml();
});
