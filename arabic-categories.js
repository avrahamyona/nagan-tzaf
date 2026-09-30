// Repertoire verified from published accounts of Hebrew piyut on Arabic melodies.
const arabicCategoryNames=['מוזיקה ערבית ישראלית','מוזיקה ערבית אמיתית'];
for(const category of SEARCH_CATEGORIES){
 if(category[0]==='רוק')category.splice(0,2,arabicCategoryNames[0],arabicCategoryNames[0]);
 if(category[0]==='שירי אהבה')category.splice(0,2,arabicCategoryNames[1],arabicCategoryNames[1]);
}
const ordinaryCategorySearch=runSearch;
async function arabicRepertoire(kind){
 const specs=kind===0?[
 {q:'משה חבושה אל בעניי',match:t=>/משה חבושה/.test(t.title+' '+t.artist)&&/אל בע[נו]יי?|אל בעוני|א-ל בעוני/.test(t.title)},
 {q:'משה חבושה אלי חסרה',match:t=>/משה חבושה/.test(t.title+' '+t.artist)&&/אלי חסרה/.test(t.title)}
 ]:[
 {q:'أم كلثوم إنت عمري',match:t=>t.musicCatalog&&t.ch==='UCMi73zodlL6dMA8tyJDOClw'&&t.title==='انت عمري'},
 {q:'Mohamed Abdel Wahab Cleopatra',match:t=>t.musicCatalog&&t.ch==='UCfpEX-nBOXPu0h-hDnS8Kqg'&&/^Cleopatra/.test(t.title)}
 ];
 const results=await Promise.allSettled(specs.map(async spec=>(await within(searchMusicCached(spec.q),17000)).filter(spec.match).slice(0,kind===0?2:3)));
 const seen=new Set;return results.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true;});
}
runSearch=async function(q,pill){
 const kind=arabicCategoryNames.indexOf(q);if(kind<0||searchScope==='library')return ordinaryCategorySearch(q,pill);
 lastQuery=q;switchTab('search');$('searchHome').classList.add('hidden');$('searchRes').classList.remove('hidden');
 const seq=++searchSeq,box=$('resBody');box.innerHTML='<div class="empty"><p>טוען שירים...</p></div>';
 const tracks=await arabicRepertoire(kind);if(seq!==searchSeq)return;
 box.replaceChildren();const heading=document.createElement('h2');heading.className='secttl';heading.textContent=q;box.appendChild(heading);
 const note=document.createElement('p');note.className='catalog-note dim';note.textContent=kind===0?'מבחר ראשוני: פיוטים בעברית בלחני אינתה עומרי וקלאופטרה.':'מבחר ראשוני של שירים בערבית: אום כולתום ומוחמד עבד אל-והאב.';box.appendChild(note);
 if(!tracks.length){const empty=document.createElement('p');empty.textContent='המבחר לא זמין כרגע. נסה שוב.';box.appendChild(empty);return;}
 tracks.forEach((t,i)=>box.appendChild(trackRow(t,{artistLink:true,queueSwipe:true,onPlay:()=>playQueue(tracks,i)})));
};
if(!lastQuery)renderSearchHome();
