// v218: clickable right/left arrows on the search albums carousel.
// A desktop mouse can't drag an overflow-x row whose scrollbar is hidden,
// so wrap .hscroll.js-albums rows with explicit edge buttons that page the
// row. Applied by observer so async search paints are covered.
(() => {
  const addArrows = (scroller) => {
    if (scroller.dataset.hswDone) return;
    scroller.dataset.hswDone = '1';
    const holder = document.createElement('div');
    holder.className = 'hsw js-albums';
    const mk = (cls, label, glyph, delta) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hsw-btn ' + cls;
      b.setAttribute('aria-label', label);
      b.innerHTML = glyph;
      b.addEventListener('click', () => {
        const rtl = getComputedStyle(scroller).direction === 'rtl';
        const amount = Math.max(scroller.clientWidth - 120, 260);
        scroller.scrollBy({ left: (rtl ? -1 : 1) * delta * amount, behavior: 'smooth' });
      });
      return b;
    };
    const prev = mk('prev', 'אלבומים קודמים', '&#8250;', -1);
    const next = mk('next', 'עוד אלבומים', '&#8249;', 1);
    scroller.replaceWith(holder);
    holder.append(scroller, prev, next);
    const update = () => {
      const over = scroller.scrollWidth > scroller.clientWidth + 8;
      prev.style.display = next.style.display = over ? 'flex' : 'none';
    };
    requestAnimationFrame(update);
    window.addEventListener('resize', update);
  };
  const scan = (root) => {
    if (root.matches?.('.hscroll.js-albums')) addArrows(root);
    root.querySelectorAll?.('.hscroll.js-albums').forEach(addArrows);
  };
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach(scan);
  }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
})();
