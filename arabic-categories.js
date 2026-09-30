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
 {q:'משה חבושה אלי חסרה',match:t=>/משה חבושה/.test(t.title+' '+t.artist)&&/אלי חסרה/.test(t.title)},
 {q:'ציון יחזקאל אל גליל',match:t=>t.musicCatalog&&t.ch==='UCHJEA-zPIdyjpIiUmwF7rNg'&&t.title==='אל גליל'},
 {q:'ציון יחזקאל אל בעוני הבט',match:t=>t.musicCatalog&&t.ch==='UCHJEA-zPIdyjpIiUmwF7rNg'&&t.title==='אל בעוני הבט'},
 {q:'יובל טייב מחרוזת הבדלה',match:t=>t.musicCatalog&&t.ch==='UCJ9MOj5CuA0gaehrxG5usMw'&&t.title==='מחרוזת הבדלה'},
 {q:'משה חבושה אל בעוני הבט תפארת הפיוט',match:t=>t.ch==='UCvQ-FLyMnStA953qDSa8NIA'&&/משה חבושה/.test(t.title)&&/אל בעוני/.test(t.title)},
 {q:'יחיאל נהרי אל בעניי הבט',match:t=>t.musicCatalog&&t.ch==='UCNGMSfhi-Mh_B_Fc5hQbX-w'&&/אל בעניי הבט/.test(t.title)},
 {q:'יחיאל נהרי פאר נעטר',match:t=>/יחיאל נהרי/.test(t.title)&&/פאר נעטר/.test(t.title)},
 {q:'עופר לוי פיוטי סליחות',match:t=>t.musicCatalog&&t.artist==='עופר לוי - Ofer Levi'&&t.title==='פיוטי סליחות'}
 ]:[
 {q:'أم كلثوم إنت عمري',match:t=>t.musicCatalog&&t.ch==='UCMi73zodlL6dMA8tyJDOClw'&&t.title==='انت عمري'},
 {q:'Mohamed Abdel Wahab Cleopatra',match:t=>t.musicCatalog&&t.ch==='UCfpEX-nBOXPu0h-hDnS8Kqg'&&/^Cleopatra/.test(t.title)},
 {q:'Mohamed Abdel Wahab Ya Msafer Wahdak',match:t=>t.musicCatalog&&t.ch==='UCfpEX-nBOXPu0h-hDnS8Kqg'&&t.title==='Ya Msafeir Wahdak'},
 {q:'Farid Al Atrash Albi Wa Moftaho',match:t=>t.musicCatalog&&t.ch==='UCLlXnM1R9aMay2f-fg85EPw'&&t.title==='Albi We Moftahou'},
 {q:'Farid Al Atrash Ya Albi Ya Magrouh',match:t=>t.musicCatalog&&t.ch==='UCLlXnM1R9aMay2f-fg85EPw'&&/Ya Alb[y|i] Ya Magrouh/.test(t.title)},
 {q:'Abdel Halim Hafez El Toba',match:t=>t.musicCatalog&&t.ch==='UC2AunJnbADpAliYHtSOrnfw'&&/^El Toba/.test(t.title)}
 ];
 const progressive=[];
 const results=await Promise.allSettled(specs.map(async spec=>{const tracks=(await within(searchMusicCached(spec.q),17000)).filter(spec.match).slice(0,kind===0?2:3);progressive.push(...tracks);window.genreProgressHooks?.get(arabicCategoryNames[kind])?.(progressive.slice());return tracks;}));
 const seen=new Set;return results.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true;});
}
runSearch=async function(q,pill){
 const kind=arabicCategoryNames.indexOf(q);if(kind<0||searchScope==='library')return ordinaryCategorySearch(q,pill);
 lastQuery=q;switchTab('search');$('searchHome').classList.add('hidden');$('searchRes').classList.remove('hidden');
 const seq=++searchSeq,box=$('resBody');box.innerHTML='<div class="empty"><p>טוען שירים...</p></div>';
 const tracks=await arabicRepertoire(kind);if(seq!==searchSeq)return;
 box.replaceChildren();const heading=document.createElement('h2');heading.className='secttl';heading.textContent=q;box.appendChild(heading);
 const note=document.createElement('p');note.className='catalog-note dim';note.textContent=kind===0?'פיוט ומקאמים: משה חבושה, ציון יחזקאל, יובל טייב, יחיאל נהרי ועופר לוי · גם ביצועי תפארת הפיוט.':'קלאסיקות בערבית: אום כולתום, מוחמד עבד אל-והאב, פריד אל-אטרש ועבד אל-חלים חאפז.';box.appendChild(note);
 if(!tracks.length){const empty=document.createElement('p');empty.textContent='המבחר לא זמין כרגע. נסה שוב.';box.appendChild(empty);return;}
 tracks.forEach((t,i)=>box.appendChild(trackRow(t,{artistLink:true,queueSwipe:true,onPlay:()=>playQueue(tracks,i)})));
};
if(!lastQuery)renderSearchHome();
