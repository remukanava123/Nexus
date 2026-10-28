// Pointer effects for the v6 look: card spotlight and tilt, button ripples. Cheap: one delegated listener each.
(function () {
  const CARD = '.game, .tile, .stat-card, .g-card';
  let raf = 0, last = null;
  document.addEventListener('pointermove', (e) => {
    if (document.body.classList.contains('no-anim')) return;
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const card = last.target.closest && last.target.closest(CARD);
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = (last.clientX - r.left) / r.width, y = (last.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
      if (card.classList.contains('game')) {
        card.style.setProperty('--ry', `${((x - 0.5) * 12).toFixed(1)}deg`);
        card.style.setProperty('--rx', `${((0.5 - y) * 12).toFixed(1)}deg`);
      }
    });
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    const card = e.target.closest && e.target.closest('.game');
    if (card && !card.contains(e.relatedTarget)) { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); }
  }, { passive: true });
  document.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('no-anim')) return;
    const el = e.target.closest && e.target.closest('button, .chip, .tile, .game');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'rip';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    el.appendChild(s);
    setTimeout(() => s.remove(), 650);
  }, { passive: true });
})();
