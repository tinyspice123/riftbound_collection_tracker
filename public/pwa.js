let updateAccepted=false;

function showUpdatePrompt(registration){
  if(document.getElementById('updateBanner') || !registration.waiting) return;
  const banner=document.createElement('div');
  banner.id='updateBanner';
  banner.className='update-banner';
  banner.setAttribute('role','status');
  const message=document.createElement('span');
  message.textContent='A new version of the tracker is available.';
  const button=document.createElement('button');
  button.type='button';
  button.textContent='Refresh';
  button.addEventListener('click',()=>{
    updateAccepted=true;
    button.disabled=true;
    button.textContent='Updating…';
    registration.waiting.postMessage({type:'SKIP_WAITING'});
  });
  banner.append(message,button);
  document.body.appendChild(banner);
}

function watchForUpdate(registration){
  if(registration.waiting && navigator.serviceWorker.controller)
    showUpdatePrompt(registration);
  registration.addEventListener('updatefound',()=>{
    const worker=registration.installing;
    if(!worker) return;
    worker.addEventListener('statechange',()=>{
      if(worker.state==='installed' && navigator.serviceWorker.controller)
        showUpdatePrompt(registration);
    });
  });
}

if('serviceWorker' in navigator){
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloading || !updateAccepted) return;
    reloading=true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(watchForUpdate)
    .catch(error=>console.warn('Service worker registration failed.',error));
}
