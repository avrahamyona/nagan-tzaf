// Keep the full Songs section intact; only lift lyric results above it.
function orderSearchResults(){
 const box=$('resBody'),lyrics=[...box.querySelectorAll(':scope > .js-lyr')];if(!lyrics.length)return;
 const ordered=[...lyrics,...[...box.children].filter(x=>!lyrics.includes(x))];
 if(ordered.every((x,i)=>box.children[i]===x))return;
 rankObserver.disconnect();for(const x of ordered)box.appendChild(x);rankObserver.observe(box,{childList:true});
}
const rankObserver=new MutationObserver(orderSearchResults);rankObserver.observe($('resBody'),{childList:true});
