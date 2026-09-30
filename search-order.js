// Original catalog song first, verified lyric matches next, other results afterward.
const rowBeforeRanking=trackRow;
trackRow=function(t,opts={}){const row=rowBeforeRanking(t,opts);row.dataset.catalog=String(!!t.musicCatalog);row.dataset.songTitle=normTxt(t.title);return row;};
function orderSearchResults(){
 const box=$('resBody'),lyrics=[...box.querySelectorAll(':scope > .js-lyr')],songs=box.querySelector(':scope > div.js-songs');if(!lyrics.length||!songs)return;
 const q=normTxt(lastQuery);let lead=box.querySelector(':scope > .search-original');
 if(!lead){
 const candidate=[...songs.children].find(row=>row.dataset.catalog==='true'&&row.dataset.songTitle?.split(' ').length>=2&&q.includes(row.dataset.songTitle)&&!/(קאבר|cover|remix|רמיקס|live|הופעה)/i.test(row.dataset.songTitle));
 if(candidate){lead=document.createElement('div');lead.className='search-original';const h=document.createElement('h2');h.className='secttl';h.textContent='שיר';lead.append(h,candidate);box.prepend(lead);}
 }
 const ordered=[...(lead?[lead]:[]),...lyrics,...[...box.children].filter(x=>x!==lead&&!lyrics.includes(x))];
 if(ordered.every((x,i)=>box.children[i]===x))return;
 rankObserver.disconnect();for(const x of ordered)box.appendChild(x);rankObserver.observe(box,{childList:true,subtree:true});
}
const rankObserver=new MutationObserver(orderSearchResults);rankObserver.observe($('resBody'),{childList:true,subtree:true});
