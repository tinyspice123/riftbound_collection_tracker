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

async function progress(cfg){
  if(!cfg.sheet) return null;
  const res=await fetch(cfg.sheet,{cache:"no-store"});
  if(!res.ok) throw new Error('sheet fetch failed: '+res.status);
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
  const a=document.createElement(cfg.sheet?'a':'article');
  a.className='setcard';
  if(cfg.sheet) a.href='tracker.html?set='+encodeURIComponent(id);
  else{
    a.classList.add('unconfigured');
    a.setAttribute('aria-disabled','true');
  }
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
  if(!cfg.sheet){
    a.querySelector('[data-prog]').textContent='Not configured';
  } else {
    const cached=getCachedProgress(id);
    if(cached) paintProgress(a,cached);
    progress(cfg).then(p=>{
      if(!p) return; // keep showing the cached value (or "…") rather than blanking
      paintProgress(a,p);
      setCachedProgress(id,p);
    }).catch(()=>{ if(!cached) a.querySelector('[data-prog]').textContent=''; });
  }
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
