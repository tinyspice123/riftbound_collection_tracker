const main=document.getElementById('sets');
const HOME_GROUPS={
  core:"Core Sets",
  promo:"Promos and Special Releases",
  misc:"Other Collections",
};
const groupGrids=new Map();
function groupGrid(key){
  const safeKey=Object.hasOwn(HOME_GROUPS,key)?key:'misc';
  if(groupGrids.has(safeKey)) return groupGrids.get(safeKey);
  const section=document.createElement('section');
  section.className='setgroup';
  section.dataset.group=safeKey;
  const heading=document.createElement('h2');
  heading.textContent=HOME_GROUPS[safeKey];
  const grid=document.createElement('div');
  grid.className='sets';
  section.append(heading,grid);
  main.appendChild(section);
  groupGrids.set(safeKey,grid);
  return grid;
}

async function csvProgress(id){
  const res=await fetch(`backups/${encodeURIComponent(id)}.csv`,{cache:"no-store"});
  if(!res.ok) throw new Error('backup fetch failed: '+res.status);
  const text=await res.text();
  if(/^\s*</.test(text)) throw new Error('got a web page, not CSV');
  const rows=csvToRows(text);
  // find header row: needs a "card"-ish and "have"-ish column
  let hi=-1,ci=-1,haveI=-1;
  for(let r=0;r<Math.min(rows.length,5);r++){
    const low=rows[r].map(x=>x.trim().toLowerCase());
    const c=low.findIndex(h=>h.includes("card"));
    const hv=low.findIndex(h=>h.includes("have")||h.includes("own")||h.includes("qty"));
    if(c>-1&&hv>-1){hi=r;ci=c;haveI=hv;break;}
  }
  if(hi<0) return null;
  let total=0,owned=0;
  for(let r=hi+1;r<rows.length;r++){
    const card=(rows[r][ci]||"").trim();
    if(!card) continue;           // group header / blank rows
    total++;
    if(parseHaveQty(rows[r][haveI])>0) owned++;
  }
  return {owned,total};
}

async function progress(id){
  try{
    const cards=await RiftboundDb.cards(id);
    if(cards.length) return {owned:cards.filter(card=>Number(card.quantity)>0).length,total:cards.length};
  }catch{ /* retain the committed database export as an outage fallback */ }
  return csvProgress(id);
}

// ---- cache last-seen progress per set so returning visitors see numbers
// instantly instead of a "…" flash while every set's sheet re-fetches ----
function getCachedProgress(id){
  try{ return JSON.parse(localStorage.getItem('progress:'+id)||'null'); }catch(e){ return null; }
}
function setCachedProgress(id,p){
  try{ localStorage.setItem('progress:'+id, JSON.stringify(p)); }
  catch{ /* progress caching is optional when storage is unavailable */ }
}
function paintProgress(a,p){
  const t=a.querySelector('[data-prog]'), b=a.querySelector('[data-bar]');
  t.textContent=`${p.owned} / ${p.total} owned`;
  b.style.width=(p.total? (100*p.owned/p.total):0)+'%';
}

Object.entries(SETS).forEach(([id,cfg])=>{
  const a=document.createElement('a');
  a.className='setcard';
  a.href='tracker.html?set='+encodeURIComponent(id);
  const logoCands=['assets/logos/'+id+'.png'];
  if(cfg.logo) logoCands.push(cfg.logo);
  a.innerHTML=`
    <img alt="${esc(cfg.name)}"
      data-alts="${esc(logoCands.slice(1).join('|'))}">
    <div class="meta"><span class="code">${esc(cfg.code||"")}</span><span class="prog" data-prog>…</span></div>
    <div class="bar"><i data-bar></i></div>`;
  const logoImg=a.querySelector('img');
  logoImg.addEventListener('error',function(){
    const alternatives=(this.dataset.alts||'').split('|').filter(Boolean);
    if(alternatives.length){
      this.dataset.alts=alternatives.slice(1).join('|');
      if(!setSafeImageSource(this,alternatives[0],document.baseURI)) this.dispatchEvent(new Event('error'));
    }else{
      this.replaceWith(Object.assign(document.createElement('div'),
        {className:'noimg',textContent:cfg.name}));
    }
  });
  setSafeImageSource(logoImg,logoCands[0]||'',document.baseURI);
  a.dataset.search=(id+" "+cfg.name+" "+(cfg.code||"")).toLowerCase();
  groupGrid(cfg.homeGroup||'misc').appendChild(a);
  const cached=getCachedProgress(id);
  if(cached) paintProgress(a,cached);
  progress(id).then(p=>{
    if(!p) return;
    paintProgress(a,p);
    setCachedProgress(id,p);
  }).catch(()=>{ if(!cached) a.querySelector('[data-prog]').textContent=''; });
});
document.getElementById('setSearch').addEventListener('input', e=>{
  const q=e.target.value.trim().toLowerCase();
  let visible=0;
  document.querySelectorAll('.setcard').forEach(card=>{
    const hit=!q || card.dataset.search.includes(q);
    card.classList.toggle('hidden', !hit);
    if(hit) visible++;
  });
  document.querySelectorAll('.setgroup').forEach(group=>{
    group.classList.toggle('hidden', !group.querySelector('.setcard:not(.hidden)'));
  });
  document.getElementById('noResults').style.display = visible? 'none':'block';
});
