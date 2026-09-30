// YouTube HQ thumbnails are 4:3 files with baked-in black bars around 16:9 content.
// Use the bar-free 16:9 source and existing frame-specific cover crops everywhere.
function cleanThumbnailURL(src){return src.replace(/(i\.ytimg\.com\/vi\/[\w-]+\/)hqdefault\.jpg/g,'$1mqdefault.jpg');}
function cleanThumbnail(el){
 if(el.tagName==='IMG'&&el.src.includes('i.ytimg.com/vi/')){const next=cleanThumbnailURL(el.src);if(next!==el.src)el.src=next;}
 const bg=el.style?.backgroundImage;if(bg?.includes('i.ytimg.com/vi/')){const next=cleanThumbnailURL(bg);if(next!==bg)el.style.backgroundImage=next;}
}
function cleanThumbTree(root){if(root.nodeType!==1)return;cleanThumbnail(root);root.querySelectorAll('img,[style]').forEach(cleanThumbnail);}
cleanThumbTree(document.documentElement);
new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')cleanThumbnail(r.target);else r.addedNodes.forEach(cleanThumbTree);}}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','style']});
