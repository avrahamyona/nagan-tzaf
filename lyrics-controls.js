// Desktop lyrics remains independent of the full player. Compact transport only.
function addLyricsTransport(){
 if($('lyricsTransport'))return;
 const controls=document.createElement('div');controls.id='lyricsTransport';
 for(const [name,target,icon] of [['הקודם','cPrev','prev'],['נגן או השהה','cPlay','play'],['הבא','cNext','next']]){
 const b=document.createElement('button');b.type='button';b.className='ibtn';b.setAttribute('aria-label',name);b.dataset.target=target;b.innerHTML='<svg><use href="#i-'+icon+'"/></svg>';b.onclick=()=>$(target).click();controls.appendChild(b);
 }
 document.querySelector('.lyrinner').appendChild(controls);
 const copy=()=>{const use=$('cPlay').querySelector('use');if(use)controls.querySelector('[data-target="cPlay"] use').setAttribute('href',use.getAttribute('href'));};
 new MutationObserver(copy).observe($('cPlay'),{attributes:true,subtree:true,childList:true});copy();
}
const lyricsControlsStyle=document.createElement('style');lyricsControlsStyle.textContent='#lyricsTransport{display:none}@media(min-width:820px){#lyricsTransport{display:flex;direction:ltr;align-items:center;justify-content:center;gap:18px;padding:10px 12px;margin-top:6px;border-top:1px solid var(--border)}#lyricsTransport button{width:32px;height:32px}#lyricsTransport svg{width:19px;height:19px}}';document.head.appendChild(lyricsControlsStyle);addLyricsTransport();
