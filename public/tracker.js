// ---- per-set config lives in sets.js -------------------------------
// This page is a template: tracker.html?set=<id> loads SETS[<id>].
const params = new URLSearchParams(location.search);
const SET_ID = (typeof SETS!=="undefined" && SETS[params.get('set')]) ? params.get('set') : Object.keys(SETS)[0];
const cfg = SETS[SET_ID];
const BACKUP_URL = `backups/${encodeURIComponent(SET_ID)}.csv`;

// header branding from config
document.title = cfg.name + " — Riftbound Collection Tracker";
{
  const logoCands=["assets/logos/"+SET_ID+".png"];
  if(cfg.logo) logoCands.push(cfg.logo);
  const el=document.getElementById('setLogo');
  el.dataset.alts=logoCands.slice(1).join("|");
  setSafeImageSource(el,logoCands[0]||"",document.baseURI);
  el.addEventListener('error', function(){
    const alts=(this.dataset.alts||'').split('|').filter(Boolean);
    if(alts.length){
      this.dataset.alts=alts.slice(1).join('|');
      if(!setSafeImageSource(this,alts[0],document.baseURI)) this.dispatchEvent(new Event('error'));
    }
    else{ this.style.display='none'; document.getElementById('titleFallback').style.display='block'; }
  });
}
document.getElementById('setLogo').alt = cfg.name;
document.getElementById('eyebrowText').textContent =
  cfg.eyebrow || ("Riftbound TCG · "+(cfg.code||"").toUpperCase()+" · Collection checklist");
document.getElementById('fallbackName').textContent = cfg.name;
if(cfg.subtitle){
  const st=document.getElementById('subtitleText');
  st.textContent=cfg.subtitle; st.style.display='block';
}
// ----------------------------------------------------------------------

let items=[];
let authSession=null;
let authUser=null;
let canEdit=false;
const pendingCards=new Set();
let bulkMode=false;
const bulkSelections=new Set();

// ---- "synced Xs ago" ------------------------------------------------
let lastSyncedAt=null;
function markSynced(){ lastSyncedAt=Date.now(); updateSyncedLabel(); }
function updateSyncedLabel(){
  const el=document.getElementById('syncedInfo');
  if(!lastSyncedAt){ el.textContent=''; return; }
  const s=Math.round((Date.now()-lastSyncedAt)/1000);
  let txt;
  if(s<10) txt='Synced just now';
  else if(s<60) txt=`Synced ${s}s ago`;
  else if(s<3600) txt=`Synced ${Math.round(s/60)}m ago`;
  else txt=`Synced ${Math.round(s/3600)}h ago`;
  el.textContent=txt;
}
setInterval(updateSyncedLabel, 15000);

window.addEventListener('DOMContentLoaded', async ()=>{
  await loadImgManifest();
  await initAuth();
  try{
    const cards=await RiftboundDb.cards(SET_ID);
    if(!cards.length) throw new Error('The database has no cards for this set yet.');
    items=cards.map(card=>({
      id:card.id,group:card.group_name,card:card.card_name,num:card.collector_number,
      variant:card.variant,src:card.source,price:card.price,status:card.status,
      qty:Number(card.quantity)||0,img:card.image_url,
    }));
    finishLoad();
    markSynced();
  }catch(databaseError){
    try{
      parseRows(await fetchCsvRows(BACKUP_URL));
      showDatabaseFallback(databaseError);
    }catch(backupError){
      showDataFailure(databaseError,backupError);
    }
  }
});

async function initAuth(){
  authSession=await RiftboundDb.currentSession();
  authUser=await RiftboundDb.currentUser(authSession);
  canEdit=await RiftboundDb.isEditor(authSession);
  document.getElementById('googleSignIn').style.display=authUser?'none':'block';
  document.getElementById('signedIn').style.display=authUser?'flex':'none';
  document.getElementById('accountEmail').textContent=authUser?.email||'';
  document.getElementById('viewerOnly').style.display=authUser&&!canEdit?'inline':'none';
  document.getElementById('liveCsv').style.display=canEdit?'inline-block':'none';
  document.getElementById('bulkStart').style.display=canEdit?'inline-block':'none';
  if(canEdit) loadQuantityHistory();
}

async function loadQuantityHistory(){
  const section=document.getElementById('history'), list=document.getElementById('historyList');
  try{
    const entries=await RiftboundDb.quantityHistory(authSession,SET_ID,
      document.getElementById('historyFrom').value,document.getElementById('historyTo').value);
    const rows=entries.length?entries.map(entry=>{
      const item=document.createElement('li'), time=document.createElement('time');
      const when=new Date(entry.changed_at);
      time.dateTime=when.toISOString(); time.textContent=when.toLocaleString();
      item.append(time,`${entry.card_name} · ${entry.collector_number||'no number'} · ${entry.set_id}: ${entry.previous_quantity} → ${entry.new_quantity}`);
      return item;
    }):[Object.assign(document.createElement('li'),{textContent:'No changes in this date range.'})];
    list.replaceChildren(...rows);
    section.style.display='block';
  }catch{ /* History is optional until its migration has been applied. */ }
}
function localDate(daysAgo=0){
  const date=new Date(); date.setDate(date.getDate()-daysAgo);
  const pad=value=>String(value).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
document.getElementById('historyFrom').value=localDate(1);
document.getElementById('historyTo').value=localDate();
document.getElementById('historyApply').addEventListener('click',()=>{
  const from=document.getElementById('historyFrom').value, to=document.getElementById('historyTo').value;
  if(!from||!to||from>to){ toast('Choose a valid history date range.'); return; }
  loadQuantityHistory();
});

document.getElementById('googleSignIn').addEventListener('click',()=>RiftboundDb.signInWithGoogle());
document.getElementById('signOut').addEventListener('click',async ()=>{
  await RiftboundDb.signOut(authSession);
  location.reload();
});

function finishLoad(){
  buildGroupSel(); applyFilterParams(); render();
  document.getElementById('stats').style.display='grid';
  document.getElementById('controls').style.display='flex';
  document.getElementById('foot').style.display='block';
}
async function fetchCsvRows(url){
  const res=await fetchCsvResponse(url);
  ensureCsvResponse(res);
  const text=await res.text();
  ensureCsvText(text);
  const rows=csvToRows(text);
  ensureCsvColumns(rows);
  return rows;
}

async function fetchCsvResponse(url){
  try{
    return await fetch(url,{cache:"no-store"});
  }catch(error){
    throw new Error('The database snapshot could not be reached.',{cause:error});
  }
}

function ensureCsvResponse(res){
  if(res.ok) return;
  throw new Error(`The database snapshot returned HTTP ${res.status}.`);
}

function ensureCsvText(text){
  if(!/^\s*</.test(text)) return;
  throw new Error('The database snapshot is not valid CSV data.');
}

function ensureCsvColumns(rows){
  const columns=detectColumns(rows[0]);
  if(columns.cCard>=0 && columns.cHave>=0) return;
  throw new Error('The database snapshot is missing required Card or Have columns.');
}

function showDatabaseFallback(error){
  const banner=document.getElementById('dataBanner');
  banner.textContent='Database unavailable — showing the latest read-only repository snapshot.';
  banner.title=String(error.message||error);
  banner.classList.add('show');
}

function showDataFailure(liveError,backupError){
  const notice=document.getElementById('notice');
  const inner=notice.querySelector('.inner');
  inner.replaceChildren();
  const title=document.createElement('div');
  title.className='notice-title';
  title.textContent='Collection data is temporarily unavailable';
  const live=document.createElement('div');
  live.textContent=String(liveError.message||liveError);
  const backup=document.createElement('div');
  backup.textContent=String(backupError.message||backupError);
  inner.append(title,live,backup);
  notice.style.display='block';
}

function parseRows(rows){
  items=rowsToItems(rows);
  finishLoad();
}

// ---- img folder manifest (downloaded copies of sheet Image URLs)
let imgMap = new Map(); // "card|number|variant" -> filename in img/
async function loadImgManifest(){
  try{
    const res=await fetch('img/'+SET_ID+'/manifest.txt', {cache:"no-store"});
    if(!res.ok) return;
    (await res.text()).split('\n').forEach(line=>{
      if(!line.trim()) return;
      const parts=line.split('|');
      if(parts.length>=4){ // card|number|variant|filename
        const file=parts.at(-1);
        imgMap.set(manifestKey(parts[0],parts[1],parts.slice(2,-1).join('|')), file);
      }
    });
  }catch{ /* the image manifest is optional; a missing or unparseable one is fine */ }
}

function imgCandidates(it){ return imgCandidatesPure(it, cfg, SET_ID, imgMap); }
function imgUrl(it){ return imgCandidates(it)[0] || null; }

function buildGroupSel(){
  const sel=document.getElementById('groupSel');
  sel.innerHTML='<option value="">All groups</option>';
  [...new Set(items.map(i=>i.group))].forEach(g=>{
    const o=document.createElement('option'); o.value=g; o.textContent=g; sel.appendChild(o);
  });
}

// sortItems moved to lib.js (pure: takes the mode as an argument)

// ---- collapsible groups (state kept per set) ----
const COLLAPSE_KEY='collapse:'+SET_ID;
const VIEW_KEY='view-mode';
const SORT_KEY='sort-mode';
let storageWarningShown=false;
function noteStorageFailure(operation,error){
  if(storageWarningShown) return;
  storageWarningShown=true;
  console.warn(`Browser storage ${operation} failed; preferences will last only for this page.`,error);
}
function storageGet(key){
  try{ return localStorage.getItem(key); }
  catch(error){
    noteStorageFailure('read',error);
    return null;
  }
}
function storageSet(key,value){
  try{ localStorage.setItem(key,value); return true; }
  catch(error){
    noteStorageFailure('write',error);
    return false;
  }
}
let collapsed=new Set();
try{ collapsed=new Set(JSON.parse(storageGet(COLLAPSE_KEY)||'[]')); }
catch(error){
  console.warn('Ignoring malformed saved group state.',error);
  collapsed=new Set();
}
const savedView=storageGet(VIEW_KEY);
document.getElementById('viewSel').value=savedView==='table'?'table':'cards';
const savedSort=storageGet(SORT_KEY);
const validSort=new Set(['','name','price-desc','price-asc']);
document.getElementById('sortSel').value=validSort.has(savedSort)?savedSort:'';

function applyFilterParams(){
  const current=new URLSearchParams(location.search);
  document.getElementById('q').value=current.get('q')||'';
  document.getElementById('missOnly').checked=current.get('missing')==='1';
  const group=current.get('group')||'';
  const select=document.getElementById('groupSel');
  select.value=[...select.options].some(option=>option.value===group)?group:'';
}
function filterUrl(){
  const next=new URL(location.href);
  const values={q:document.getElementById('q').value.trim(),
    group:document.getElementById('groupSel').value,
    missing:document.getElementById('missOnly').checked?'1':''};
  Object.entries(values).forEach(([key,value])=>value
    ? next.searchParams.set(key,value) : next.searchParams.delete(key));
  return next;
}
function commitFilters(pushHistory=false){
  const next=filterUrl();
  if(next.href!==location.href){
    const method=pushHistory?'pushState':'replaceState';
    history[method](null,'',next);
  }
  render();
}
function toggleGroup(g){
  collapsed.has(g) ? collapsed.delete(g) : collapsed.add(g);
  storageSet(COLLAPSE_KEY,JSON.stringify([...collapsed]));
  render();
}

let toastTimer=null;
function toast(msg){
  let el=document.getElementById('saveToast');
  if(!el){ el=document.createElement('div'); el.id='saveToast'; document.body.appendChild(el); }
  el.replaceChildren(document.createTextNode(msg));
  el.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),1600);
}
function render(){
  const q=document.getElementById('q').value.toLowerCase();
  const gsel=document.getElementById('groupSel').value;
  const missOnly=document.getElementById('missOnly').checked;
  const tableMode=document.getElementById('viewSel').value==='table';
  if(imageObserver) imageObserver.disconnect();
  const main=document.getElementById('main'); main.innerHTML='';

  const shown=items.filter(it=>{
    if(gsel && it.group!==gsel) return false;
    if(missOnly && it.qty>0) return false;
    if(!matchesQuery(it,q)) return false;
    return true;
  });
  document.getElementById('empty').style.display = shown.length? 'none':'block';

  [...new Set(shown.map(i=>i.group))].forEach(g=>{
    const list=sortItems(shown.filter(i=>i.group===g), document.getElementById('sortSel').value);
    const own=list.filter(i=>i.qty>0).length;
    const folded=collapsed.has(g);
    const gh=document.createElement('div'); gh.className='grouphead'+(folded?' folded':'');
    gh.setAttribute('role','button'); gh.setAttribute('tabindex','0');
    gh.setAttribute('aria-expanded', String(!folded));
    gh.innerHTML=`<h2><span class="chev">${folded?'\u25b8':'\u25be'}</span>${esc(g)}</h2>
      <span class="count">${own}/${list.length} owned</span>`;
    gh.addEventListener('click',()=>{ toggleGroup(g); });
    gh.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleGroup(g); }
    });
    main.appendChild(gh);
    if(folded) return;
    if(tableMode){
      const wrap=document.createElement('div'); wrap.className='tablewrap';
      const table=document.createElement('table'); table.className='listtable';
      table.innerHTML='<thead><tr><th>Card</th><th>Number</th><th>Variant</th><th>Source</th><th>Price</th><th>Find</th><th>Status</th><th>Quantity</th></tr></thead>';
      const body=document.createElement('tbody');
      list.forEach(it=>body.appendChild(rowEl(it)));
      table.appendChild(body); wrap.appendChild(table); main.appendChild(wrap);
    }else{
      const grid=document.createElement('div'); grid.className='grid';
      list.forEach(it=>grid.appendChild(cardEl(it)));
      main.appendChild(grid);
    }
  });
  if(!tableMode) observeLazyImages(main);
  stats();
}

let imageObserver=null;
function loadDeferredImage(img){
  const src=img.dataset.src;
  if(!src) return;
  delete img.dataset.src;
  if(!setSafeImageSource(img,src,document.baseURI)) __imgFallback(img);
}
function observeLazyImages(root){
  if(imageObserver) imageObserver.disconnect();
  const images=[...root.querySelectorAll('img[data-src]')];
  if(!('IntersectionObserver' in window)){
    images.forEach(loadDeferredImage);
    return;
  }
  imageObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      imageObserver.unobserve(entry.target);
      loadDeferredImage(entry.target);
    });
  },{rootMargin:'300px 0px'});
  images.forEach(img=>imageObserver.observe(img));
}

function __imgFallback(img){
  const alts=(img.dataset.alts||"").split("|").filter(Boolean);
  if(alts.length){
    img.dataset.alts=alts.slice(1).join("|");
    if(!setSafeImageSource(img,alts[0],document.baseURI)) __imgFallback(img);
    return;
  }
  img.replaceWith(Object.assign(document.createElement('div'),
    {className:'ph',innerHTML:'<b>'+(img.dataset.ph||'?')+'</b><span>no image</span>'}));
}

function quantityHtml(it){
  if(bulkMode&&canEdit&&it.id) return `<label class="bulkpick"><input type="checkbox" data-bulk-id="${esc(it.id)}"${bulkSelections.has(it.id)?' checked':''}> Add one</label>`;
  if(!canEdit||!it.id) return `<div class="qtytag ${it.qty?'':'zero'}">×${it.qty}</div>`;
  const disabled=pendingCards.has(it.id)?' disabled':'';
  return `<div class="qtyedit" aria-label="Quantity for ${esc(it.card)}">
    <button type="button" data-delta="-1" aria-label="Remove one ${esc(it.card)}"${disabled}>−</button>
    <output>${it.qty}</output>
    <button type="button" data-delta="1" aria-label="Add one ${esc(it.card)}"${disabled}>+</button>
  </div>`;
}

function bindQuantityControls(root,it){
  root.querySelectorAll('[data-bulk-id]').forEach(input=>input.addEventListener('change',()=>{
    input.checked?bulkSelections.add(it.id):bulkSelections.delete(it.id);
    updateBulkControls();
  }));
  root.querySelectorAll('[data-delta]').forEach(button=>button.addEventListener('click',()=>{
    updateQuantity(it,Number(button.dataset.delta));
  }));
}

async function updateQuantity(it,delta){
  if(!canEdit||!authSession||!it.id||pendingCards.has(it.id)) return;
  const previous=it.qty, next=Math.max(0,previous+delta);
  if(next===previous) return;
  it.qty=next; pendingCards.add(it.id); render();
  try{
    await RiftboundDb.setQuantity(authSession,it.id,next);
    markSynced();
    toast(`${it.card}: ${previous} → ${next}`);
    loadQuantityHistory();
  }catch(error){
    it.qty=previous;
    toast(`Could not save quantity: ${String(error.message||error)}`);
  }finally{
    pendingCards.delete(it.id); render();
  }
}

function updateBulkControls(){
  const confirm=document.getElementById('bulkConfirm');
  confirm.disabled=!bulkSelections.size;
  confirm.textContent=`Confirm ${bulkSelections.size} addition${bulkSelections.size===1?'':'s'}`;
}
function setBulkMode(enabled){
  bulkMode=enabled;
  if(!enabled) bulkSelections.clear();
  document.getElementById('bulkStart').style.display=enabled?'none':(canEdit?'inline-block':'none');
  document.getElementById('bulkActions').style.display=enabled?'inline-flex':'none';
  updateBulkControls(); render();
}
document.getElementById('bulkStart').addEventListener('click',()=>setBulkMode(true));
document.getElementById('bulkCancel').addEventListener('click',()=>setBulkMode(false));
document.getElementById('bulkConfirm').addEventListener('click',async ()=>{
  const selected=items.filter(item=>bulkSelections.has(item.id));
  if(!selected.length||!window.confirm(`Add one copy to ${selected.length} selected card${selected.length===1?'':'s'}?`)) return;
  selected.forEach(item=>{ item.qty+=1; pendingCards.add(item.id); });
  render();
  const results=await Promise.allSettled(selected.map(item=>RiftboundDb.setQuantity(authSession,item.id,item.qty)));
  let failures=0;
  results.forEach((result,index)=>{
    const item=selected[index]; pendingCards.delete(item.id);
    if(result.status==='rejected'){ item.qty-=1; failures+=1; }
  });
  if(failures) toast(`${failures} addition${failures===1?'':'s'} could not be saved.`);
  else { markSynced(); toast(`${selected.length} addition${selected.length===1?'':'s'} saved.`); loadQuantityHistory(); }
  setBulkMode(false);
});

function cardEl(it){
  const d=document.createElement('div');
  d.className='item'+(it.qty>0?' owned':'');
  const cands=imgCandidates(it);
  const url=cands[0]||null, alts=cands.slice(1);
  const initial=esc(it.card.replace(/[^A-Za-z]/g,'').slice(0,2)||'?');
  const qtyHtml=quantityHtml(it);
  d.innerHTML=`
    <div class="imgwrap${/reverse\s*holo/i.test(it.variant)?' rh':''}">
      ${url?`<img loading="lazy" decoding="async" fetchpriority="low" alt="${esc(it.card)}" data-src="${esc(url)}"
        data-alts="${esc(alts.join('|'))}" data-ph="${initial}">`
        :`<div class="ph"><b>${initial}</b><span>variant</span></div>`}
      ${it.price?`<span class="pricechip">${esc(it.price)}</span>`:''}
      <span class="havechip ${it.qty>0?'y':'n'}">${it.qty>0?'OWNED':'NEED'}</span>
      ${/reverse\s*holo/i.test(it.variant)?`<span class="rhbadge">REV HOLO</span>`:''}
      ${/verify/i.test(it.status)?`<span class="verify">verify</span>`:''}
    </div>
    <div class="meta">
      <div class="nm">${esc(it.card)}</div>
      <div class="num">${esc(it.num)}</div>
      <div class="var">${esc(it.variant)}</div>
      <div class="src">${esc(it.src)}</div>
      ${marketplaceLinks(it)}
    </div>
    ${qtyHtml}`;
  const img=d.querySelector('.imgwrap img');
  if(img){
    img.addEventListener('error',()=>__imgFallback(img));
    img.addEventListener('click',()=>openLightbox(it,img.src));
  }
  bindQuantityControls(d,it);
  d.__item=it;
  return d;
}

function marketplaceLinks(it){
  const urls=marketplaceSearchUrls(it,cfg.cardmarketSet,cfg.cardmarketUrl);
  const card=esc(it.card);
  return `<div class="marketlinks">
    <a data-market="cardmarket" href="${esc(urls.cardmarket)}" target="_blank" rel="noopener noreferrer"
      aria-label="Search Cardmarket for ${card}">Cardmarket</a>
    <a data-market="ebay" href="${esc(urls.ebay)}" target="_blank" rel="noopener noreferrer"
      aria-label="Search eBay for ${card}">eBay</a>
  </div>`;
}

function rowEl(it){
  const row=document.createElement('tr');
  row.className=it.qty>0?'owned':'';
  const qtyHtml=quantityHtml(it);
  row.innerHTML=`
    <td class="cardname">${esc(it.card)}</td>
    <td class="cardnum">${esc(it.num)}</td>
    <td class="variant">${esc(it.variant)}</td>
    <td class="source">${esc(it.src)}</td>
    <td class="price">${esc(it.price)}</td>
    <td>${marketplaceLinks(it)}</td>
    <td><span class="havechip ${it.qty>0?'y':'n'}">${it.qty>0?'OWNED':'NEED'}</span></td>
    <td>${qtyHtml}</td>`;
  bindQuantityControls(row,it);
  return row;
}


const lb=document.getElementById('lightbox'), lbImg=document.getElementById('lbImg');
let lbList=[], lbIndex=-1;
let lbRequest=0;
function openLightbox(it,shownSrc){
  const request=++lbRequest;
  lbList=[...document.querySelectorAll('.item')].filter(card=>card.__item && card.querySelector('.imgwrap img'));
  lbIndex=lbList.findIndex(card=>card.__item===it);
  lb.querySelector('figure').classList.toggle('rh', /reverse\s*holo/i.test(it.variant));
  document.getElementById('lbName').textContent=it.card;
  document.getElementById('lbNum').textContent=it.num;
  document.getElementById('lbVar').textContent=it.variant;
  lbImg.alt=it.card;
  lbImg.classList.add('loading');
  lbImg.onload=()=>{
    if(request===lbRequest) lbImg.classList.remove('loading');
  };
  // try the high-res scan first, fall back to the already-loaded image
  const hires=shownSrc.replace(/(\.png)$/i,'_hires$1');
  lbImg.onerror=()=>{
    if(request!==lbRequest) return;
    lbImg.onerror=null;
    setSafeImageSource(lbImg,shownSrc,document.baseURI);
  };
  setSafeImageSource(lbImg,
    shownSrc,
    document.baseURI);
  if(!lb.open) lb.showModal();  // showModal() throws if already open (arrow-key stepping reuses an open dialog)
  document.body.style.overflow='hidden';
}
function closeLightbox(){
  lbRequest++;
  if(lb.open) lb.close();
  lbImg.onload=null; lbImg.onerror=null;
  lbImg.classList.add('loading');
  lbImg.removeAttribute('src');
  document.body.style.overflow='';
}
lb.addEventListener('click',closeLightbox);
lb.querySelector('.lb-close').addEventListener('click',closeLightbox);
function lbStep(dir){
  if(!lbList.length) return;
  lbIndex=(lbIndex+dir+lbList.length)%lbList.length;
  const card=lbList[lbIndex];
  const im=card.querySelector('.imgwrap img');
  const src=im.src || im.dataset.src;
  if(card.__item && src) openLightboxKeepList(card.__item, src);
}
function openLightboxKeepList(it,src){
  const keepL=lbList, keepI=lbIndex;
  openLightbox(it,src);
  lbList=keepL; lbIndex=keepI;
}
document.addEventListener('keydown',e=>{
  const typing=/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  if(lb.open){
    // preventDefault so the dialog's own native Escape-to-cancel behavior
    // doesn't also fire alongside closeLightbox()'s own cleanup
    if(e.key==='Escape'){ e.preventDefault(); closeLightbox(); }
    else if(e.key==='ArrowRight'){ e.preventDefault(); lbStep(1); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); lbStep(-1); }
    return;
  }
  if(typing){ if(e.key==='Escape'){ document.activeElement.blur(); } return; }
  if(e.key==='/'){ e.preventDefault(); document.getElementById('q').focus(); }
  else if(e.key==='m'||e.key==='M'){ const c=document.getElementById('missOnly'); c.checked=!c.checked; commitFilters(true); }
});

function stats(){
  const total=items.length, own=items.filter(i=>i.qty>0).length;
  const pct=total? Math.round(own/total*100):0;
  document.getElementById('pct').textContent=pct+'%';
  document.getElementById('ringbar').style.strokeDashoffset=283-(283*pct/100);
  document.getElementById('sOwn').textContent=own;
  document.getElementById('sMiss').textContent=total-own;
  document.getElementById('sQty').textContent=items.reduce((a,b)=>a+b.qty,0);
  let vOwn=0,vMiss=0,anyPrice=false;
  items.forEach(i=>{const p=priceMid(i.price); if(p==null){ return; } anyPrice=true; if(i.qty>0)vOwn+=p*i.qty; else vMiss+=p;});
  document.getElementById('sValOwn').textContent='£'+vOwn.toFixed(0);
  document.getElementById('sValMiss').textContent='£'+vMiss.toFixed(0);
  document.getElementById('sValOwn').parentElement.style.display=anyPrice?'':'none';
  document.getElementById('sValMiss').parentElement.style.display=anyPrice?'':'none';
}

let searchTimer=null;
document.getElementById('q').addEventListener('input',()=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>commitFilters(false),125);
});
document.getElementById('groupSel').addEventListener('change',()=>commitFilters(true));
// ---- export missing / owned ----
function exportItems(kind){ // respects search + group filters; ignores the Missing-only toggle
  const q=(document.getElementById('q')?.value||"").trim().toLowerCase();
  const gsel=document.getElementById('groupSel').value;
  return items.filter(it=>{
    if(!it.card) return false;
    if(gsel && it.group!==gsel) return false;
    if(!matchesQuery(it,q)) return false;
    if(kind==='missing') return it.qty<=0;
    if(kind==='spares') return it.qty>1;
    return it.qty>0;
  });
}
// exportText / exportCsv moved to lib.js
function doExport(kind,act){
  const list=exportItems(kind);
  if(!list.length){ toast(`No ${kind} cards match the current filters`); return; }
  if(act==='copy'){
    navigator.clipboard.writeText(exportText(cfg.name,kind,list))
      .then(()=>toast(`Copied ${list.length} ${kind} card${list.length===1?'':'s'}`))
      .catch(()=>toast('Copy failed \u2014 browser blocked clipboard'));
  }else{
    const blob=new Blob([exportCsv(kind,list)],{type:'text/csv'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    const today=new Date().toISOString().slice(0,10); // YYYY-MM-DD, sortable in a file listing
    a.download=`${SET_ID}-${kind}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Downloaded ${list.length} ${kind} card${list.length===1?'':'s'}`);
  }
}
function downloadCsv(filename,text){
  const blob=new Blob([text],{type:'text/csv'}), link=document.createElement('a');
  link.href=URL.createObjectURL(blob); link.download=filename; link.click();
  URL.revokeObjectURL(link.href);
}
document.getElementById('liveCsv').addEventListener('click',async ()=>{
  if(!canEdit) return;
  const button=document.getElementById('liveCsv'); button.disabled=true;
  try{
    const rows=await RiftboundDb.cards(SET_ID);
    const header=['ID','Set ID','Group','Card','Number','Variant / Stamp','Source','Status','Price','Have','Image URL'];
    const lines=rows.map(card=>[
      card.id,card.set_id,card.group_name,card.card_name,card.collector_number,
      card.variant,card.source,card.status,card.price,card.quantity,card.image_url,
    ].map(value=>csvEscape(value)).join(','));
    const csvHeader=header.map(value=>csvEscape(value)).join(',');
    downloadCsv(`${SET_ID}-live-${new Date().toISOString().slice(0,10)}.csv`,[csvHeader,...lines].join('\n')+'\n');
    toast(`Downloaded ${rows.length} live database card${rows.length===1?'':'s'}`);
  }catch(error){ toast(`Could not download live data: ${String(error.message||error)}`); }
  finally{ button.disabled=false; }
});
function closeExportMenus(){
  document.querySelectorAll('.exportmenu.open').forEach(m=>m.classList.remove('open'));
  document.querySelectorAll('.exportbtn[aria-expanded="true"]').forEach(b=>b.setAttribute('aria-expanded','false'));
}
document.querySelectorAll('.exportwrap').forEach(wrap=>{
  const btn=wrap.querySelector('.exportbtn'), menu=wrap.querySelector('[data-menu]');
  const kind=btn.dataset.kind || (btn.id==='exportMissing'?'missing':'owned');
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    const wasOpen=menu.classList.contains('open');
    closeExportMenus();
    if(!wasOpen){ menu.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
  });
  menu.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation(); closeExportMenus(); doExport(kind,b.dataset.act);
  }));
});
document.addEventListener('click',closeExportMenus);
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  const open=document.querySelector('.exportmenu.open');
  if(!open) return;
  const btn=open.closest('.exportwrap').querySelector('.exportbtn');
  closeExportMenus();
  btn.focus();  // hand focus back to the trigger, as a native menu would
});

document.getElementById('missOnly').addEventListener('change',()=>commitFilters(true));
document.getElementById('sortSel').addEventListener('change',e=>{
  storageSet(SORT_KEY,e.target.value);
  render();
});
document.getElementById('viewSel').addEventListener('change',e=>{
  storageSet(VIEW_KEY,e.target.value);
  render();
});
window.addEventListener('popstate',()=>{
  clearTimeout(searchTimer);
  applyFilterParams();
  render();
});

// esc moved to lib.js
