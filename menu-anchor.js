/* v152: position tapped song menus beside their three-dots control. */
(function () {
  let tappedAnchor = null, queueAnchor = null;
  document.addEventListener('click', function(e) {
    const button=e.target.closest('.dots,#pDots,#mOptions,#queueMore');
    tappedAnchor=button;
    if(button?.id==='queueMore') {
      const r=button.getBoundingClientRect();
      queueAnchor={top:r.top,left:r.left,bottom:r.bottom,width:r.width,height:r.height};
      setTimeout(()=>{queueAnchor=null;},1000);
    }
  }, true);
function clearSongSheetPosition(sheet) {
  sheet._anchorRef = null;
  sheet.style.left = ''; sheet.style.top = ''; sheet.style.right = '';
  sheet.style.bottom = ''; sheet.style.transformOrigin = '';
}
function positionSongSheet(sheet, anchor) {
  const isEl = !!anchor?.getBoundingClientRect;
  const rect = isEl ? anchor.getBoundingClientRect() : anchor;
  if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) { clearSongSheetPosition(sheet); return; }
  sheet._anchorRef = isEl ? anchor : { top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width, height: rect.height };
  placeSongSheetAtAnchor(sheet);
  requestAnimationFrame(() => requestAnimationFrame(() => placeSongSheetAtAnchor(sheet)));
  setTimeout(() => placeSongSheetAtAnchor(sheet), 300);
  setTimeout(() => placeSongSheetAtAnchor(sheet), 650);
}
function placeSongSheetAtAnchor(sheet) {
  const ref = sheet._anchorRef;
  if (!ref || sheet.classList.contains('has-preview')) return;
  const rect = ref.getBoundingClientRect ? ref.getBoundingClientRect() : ref;
  if (!rect || (rect.width === 0 && rect.height === 0)) return;
  sheet.style.visibility = 'hidden';
  sheet.classList.remove('hidden');
  const w = sheet.offsetWidth, h = sheet.offsetHeight;
  // Keep the menu visible; openSheet handles its enter animation.
  sheet.style.visibility = '';
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const x = Math.min(Math.max(8, rect.left), vw - w - 8);
  let y = rect.bottom + 8, oy = 'top';
  if (y + h > vh - 8) { y = Math.max(8, rect.top - h - 8); oy = 'bottom'; }
  const ox = (rect.left + rect.width / 2) <= x + w / 2 ? 'left' : 'right';
  sheet.style.left = x + 'px'; sheet.style.top = y + 'px';
  sheet.style.right = 'auto'; sheet.style.bottom = 'auto';
  sheet.style.transformOrigin = oy + ' ' + ox;
}

  const previous=openSongSheet;
  openSongSheet=function(t,opts={}) {
    const sheet=$('songSheet');
    const anchor=opts.anchor || opts.anchorRect || (queueAnchor || tappedAnchor);
    clearSongSheetPosition(sheet);
    const nextOpts=opts.preview ? opts : {...opts,anchor};
    previous(t,nextOpts);
    if(!opts.preview) positionSongSheet(sheet,anchor);
    queueAnchor=null; tappedAnchor=null;
  };
})();
