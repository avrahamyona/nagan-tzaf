// v219: right/left arrows for the search albums carousel, in the exact
// pattern used by every other horizontal section on the site (.asec-arrow
// pair at the far end of the section heading, desktop only, edge-disabled).
// The search albums row is painted by 2-v151-app.js without a section
// wrapper, so this observer enhances it in place whenever it appears.
(() => {
  const CHEV_LEFT = 'M15 5l-7 7 7 7';   // points left, reveals more (RTL overflow side)
  const CHEV_RIGHT = 'M9 5l7 7-7 7';    // points right, goes back
  const svg = (d) => '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const enhance = (scroller) => {
    if (scroller.dataset.albumArrowsDone) return;
    let heading = scroller.previousElementSibling, hops = 0;
    while (heading && hops < 4 && !heading.matches('h2.secttl.js-albums')) {
      if (heading.matches('.hscroll.js-albums')) { heading = null; break; }
      heading = heading.previousElementSibling; hops++;
    }
    if (!heading) return;
    scroller.dataset.albumArrowsDone = '1';
    heading.classList.add('js-albums-head');

    const arrows = document.createElement('div');
    arrows.className = 'asec-arrows';
    const mk = (chev, contentDirection, label) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'asec-arrow';
      b.dataset.contentDirection = contentDirection;
      b.style.direction = 'ltr';
      b.innerHTML = svg(chev);
      b.setAttribute('aria-label', label + ' - ' + heading.textContent.trim());
      b.addEventListener('click', () => {
        // Same convention as home sections: left-pointing reveals more cards.
        const amount = Math.max(250, scroller.clientWidth * .8);
        scroller.scrollBy({ left: (contentDirection === 'right' ? -1 : 1) * amount, behavior: 'smooth' });
      });
      arrows.appendChild(b);
      return b;
    };
    const more = mk(CHEV_LEFT, 'right', 'עוד אלבומים');
    const back = mk(CHEV_RIGHT, 'left', 'אלבומים קודמים');

    const updateEdges = () => {
      const viewport = scroller.getBoundingClientRect();
      const cards = [...scroller.children].map(x => x.getBoundingClientRect()).filter(r => r.width > 0);
      const hiddenLeft = cards.some(r => r.left < viewport.left - 2);
      const hiddenRight = cards.some(r => r.right > viewport.right + 2);
      [more, back].forEach(button => {
        const movesLeft = button.dataset.contentDirection === 'left';
        button.disabled = !(movesLeft ? hiddenRight : hiddenLeft);
        button.setAttribute('aria-disabled', String(button.disabled));
      });
    };
    scroller.addEventListener('scroll', updateEdges, { passive: true });
    new ResizeObserver(updateEdges).observe(scroller);
    new MutationObserver(updateEdges).observe(scroller, { childList: true });
    requestAnimationFrame(updateEdges);

    heading.appendChild(arrows);
  };

  const scan = (root) => {
    if (root.matches?.('.hscroll.js-albums')) enhance(root);
    root.querySelectorAll?.('.hscroll.js-albums').forEach(enhance);
  };
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach(scan);
  }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
})();
