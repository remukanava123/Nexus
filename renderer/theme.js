// Themes, accent colours and the appearance toggles. applyTheme() is called whenever a setting changes.
const THEMES = {
  midnight: { label: 'Midnight', bg: '#0b0d12', s1: '#12151c', s2: '#181c25', s3: '#212633' },
  amoled: { label: 'AMOLED black', bg: '#000000', s1: '#07080b', s2: '#0e1015', s3: '#181b22' },
  slate: { label: 'Slate', bg: '#0e1318', s1: '#151b22', s2: '#1c242d', s3: '#27323e' },
  mocha: { label: 'Mocha', bg: '#120f0d', s1: '#1a1613', s2: '#231d19', s3: '#31281f' },
  ocean: { label: 'Ocean', bg: '#06131a', s1: '#0b1c25', s2: '#10262f', s3: '#18373f' },
  violet: { label: 'Violet', bg: '#0e0a16', s1: '#150f20', s2: '#1d1529', s3: '#2a1f3a' },
};
const ACCENTS = ['#7c5cff', '#4f8cff', '#22c3a6', '#3ddc84', '#ffb020', '#ff6b6b', '#ff5fa2', '#d9dce6'];

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = parseInt(m ? m[1] : '7c5cff', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function applyTheme(s) {
  const root = document.documentElement.style;
  const t = THEMES[s.theme] || THEMES.midnight;
  root.setProperty('--bg', t.bg);
  root.setProperty('--surface', t.s1);
  root.setProperty('--surface-2', t.s2);
  root.setProperty('--surface-3', t.s3);

  const rgb = hexToRgb(s.accent);
  const [h, sat, l] = rgbToHsl(rgb);
  root.setProperty('--accent', s.accent);
  root.setProperty('--accent-2', hslToHex(h + 28, Math.min(1, sat), Math.min(0.72, l + 0.04))); // gradient partner: nearby hue, slightly lighter
  root.setProperty('--accent-rgb', rgb.join(', '));
  // Text on an accent-coloured button: dark on very light accents, white otherwise
  root.setProperty('--on-accent', l > 0.68 ? '#10131a' : '#ffffff');

  root.setProperty('--radius', `${s.radius}px`);
  root.setProperty('--card', `${s.cardSize}px`);

  const b = document.body;
  b.dataset.density = s.density;
  b.dataset.bg = s.bgStyle;
  b.classList.toggle('no-anim', !s.animations);
  b.classList.toggle('no-blur', !s.blur);
  b.classList.toggle('hide-badges', !s.showBadges);
  b.classList.toggle('hide-titles', !s.showTitles);
  b.classList.toggle('hide-playtime', !s.showPlaytime);

  window.api.setTitlebar(t.bg, '#9aa0ae');
}
