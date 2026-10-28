// Small helpers shared by every renderer script (loaded first)
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad2 = (n) => String(n).padStart(2, '0');

// 3725 -> "1h 2m", 400 -> "6m", 20 -> "<1m"
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return m ? `${m}m` : '<1m';
}
// 3725 -> "1:02:05"
function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec / 3600)}:${pad2(Math.floor((sec % 3600) / 60))}:${pad2(sec % 60)}`;
}
// Hours as "12.5h", or "12h 30m" when Settings → Playtime → "Hours look like" says so
const fmtHours = (sec) => {
  const h = sec / 3600;
  if (typeof prefs !== 'undefined' && prefs.settings && prefs.settings.hoursFormat === 'long' && h >= 1 && h < 100) {
    const m = Math.floor((sec % 3600) / 60);
    return m ? `${Math.floor(h)}h ${m}m` : `${Math.floor(h)}h`;
  }
  return h >= 10 ? `${Math.round(h).toLocaleString()}h` : h >= 0.1 ? `${h.toFixed(1)}h` : `${Math.round(sec / 60)}m`;
};

// A CSS url() for any image address. A cover's file path can contain ' (Assassin's Creed), which ends a url('...')
// early, so the address goes in double quotes, with the few characters that could end those percent-encoded.
const cssUrl = (u) => `url("${String(u || '').replace(/["\\\n\r]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)}")`;

// Confetti burst from a point (used for launches and the game picker)
const fx = (() => {
  let canvas, ctx, parts = [], raf = 0;
  const COLORS = ['#7c5cff', '#4f8cff', '#22c3a6', '#ffb020', '#ff6b6b', '#ff5fa2', '#ffffff'];
  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter((p) => p.life > 0 && p.y < canvas.height + 40);
    for (const p of parts) {
      p.vy += 0.18; p.vx *= 0.995; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(frame) : 0;
    if (!parts.length) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  return {
    burst(x = innerWidth / 2, y = innerHeight / 2, count = 90) {
      if (document.body.classList.contains('no-anim')) return;
      canvas = canvas || $('#fx');
      if (!canvas) return;
      canvas.width = innerWidth; canvas.height = innerHeight;
      ctx = ctx || canvas.getContext('2d');
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 80 + Math.random() * 60, color: COLORS[(Math.random() * COLORS.length) | 0] });
      }
      if (!raf) raf = requestAnimationFrame(frame);
    },
  };
})();

// Hide an element with a short fade (class "out"), and cancel that fade if it's shown again
function fadeHide(el, ms = 200) {
  if (el.hidden) return;
  if (document.body.classList.contains('no-anim')) { el.hidden = true; return; }
  clearTimeout(el._fadeTimer);
  el.classList.add('out');
  el._fadeTimer = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, ms);
}
function unfade(el) {
  clearTimeout(el._fadeTimer);
  el.classList.remove('out');
  el.hidden = false;
}
