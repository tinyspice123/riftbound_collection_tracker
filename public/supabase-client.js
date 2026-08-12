const RiftboundDb = (()=>{
  const base=SUPABASE_CONFIG.url.replace(/\/$/,'');
  const key=SUPABASE_CONFIG.publishableKey;
  const SESSION_KEY='riftbound-tracker:supabase-session';

  function headers(session,extra={}){
    return {apikey:key,Authorization:`Bearer ${session?.access_token||key}`,...extra};
  }
  function readSession(){
    try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}
  }
  function saveSession(session){
    if(session) localStorage.setItem(SESSION_KEY,JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }
  function sessionFromRedirect(){
    const hash=new URLSearchParams(location.hash.slice(1));
    const access_token=hash.get('access_token'), refresh_token=hash.get('refresh_token');
    if(!access_token||!refresh_token) return null;
    const session={access_token,refresh_token,
      expires_at:Math.floor(Date.now()/1000)+Number(hash.get('expires_in')||3600)};
    saveSession(session);
    history.replaceState(null,'',location.pathname+location.search);
    return session;
  }
  async function request(path,options={}){
    const response=await fetch(base+path,options);
    if(!response.ok){
      let detail='';
      try{const body=await response.json(); detail=body.message||body.error_description||body.hint||body.details||'';}catch{ /* not JSON */ }
      throw new Error(detail||`Database request failed (${response.status})`);
    }
    return response;
  }
  async function refreshSession(session){
    if(!session?.refresh_token) return null;
    try{
      const response=await request('/auth/v1/token?grant_type=refresh_token',{
        method:'POST',headers:headers(null,{'Content-Type':'application/json'}),
        body:JSON.stringify({refresh_token:session.refresh_token})});
      const fresh=await response.json();
      fresh.expires_at=Math.floor(Date.now()/1000)+Number(fresh.expires_in||3600);
      saveSession(fresh); return fresh;
    }catch{ saveSession(null); return null; }
  }
  async function currentSession(){
    let session=sessionFromRedirect()||readSession();
    if(session?.expires_at && session.expires_at<Math.floor(Date.now()/1000)+60)
      session=await refreshSession(session);
    return session;
  }
  async function currentUser(session){
    if(!session) return null;
    try{return await (await request('/auth/v1/user',{headers:headers(session)})).json();}
    catch{saveSession(null); return null;}
  }
  function signInWithGoogle(){
    const redirect=new URL(location.href); redirect.hash='';
    const url=`${base}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect.href)}`;
    location.assign(url);
  }
  async function signOut(session){
    try{if(session) await request('/auth/v1/logout',{method:'POST',headers:headers(session)});}finally{saveSession(null);}
  }
  async function cards(setId){
    const fields='id,set_id,group_name,card_name,collector_number,variant,source,price,status,image_url,quantity';
    const path=`/rest/v1/riftbound_card_main?set_id=eq.${encodeURIComponent(setId)}&select=${fields}&order=sort_order.asc`;
    return await (await request(path,{headers:headers(null)})).json();
  }
  async function isEditor(session){
    if(!session) return false;
    try{
      const response=await request('/rest/v1/rpc/is_collection_editor',{
        method:'POST',headers:headers(session,{'Content-Type':'application/json'}),body:'{}'});
      return (await response.json())===true;
    }catch{return false;}
  }
  async function setQuantity(session,cardId,quantity){
    const path=`/rest/v1/riftbound_card_main?id=eq.${encodeURIComponent(cardId)}`;
    await request(path,{method:'PATCH',headers:headers(session,{
      'Content-Type':'application/json',Prefer:'return=minimal'}),
      body:JSON.stringify({quantity})});
  }
  async function quantityHistory(session,setId,fromDate,toDate){
    const from=new Date(`${fromDate}T00:00:00`).toISOString();
    const end=new Date(`${toDate}T00:00:00`); end.setDate(end.getDate()+1);
    const path=`/rest/v1/riftbound_card_quantity_history?set_id=eq.${encodeURIComponent(setId)}&changed_at=gte.${encodeURIComponent(from)}&changed_at=lt.${encodeURIComponent(end.toISOString())}&select=card_name,collector_number,set_id,previous_quantity,new_quantity,changed_at&order=changed_at.desc&limit=500`;
    return await (await request(path,{headers:headers(session)})).json();
  }
  return {currentSession,currentUser,signInWithGoogle,signOut,cards,isEditor,setQuantity,quantityHistory};
})();
