// Riftbound Collection Tracker service worker.
// Strategy: network-first for pages/config (so updates land immediately),
// cache-first for images and logos (fast + offline), never cache sheet CSVs
// beyond a session fallback.
const VERSION = 'shell-__BUILD_VERSION__';
// Keep downloaded card art across shell releases. Browser storage quotas still
// apply, so the user agent may evict older images when space is constrained.
const IMAGE_CACHE = 'card-images-v2';
const IMAGE_CACHE_LIMIT = 200;
const SHELL = [
  './', 'index.html', '404.html', 'fonts.css', 'index.css', 'index.js',
  'tracker.html', 'tracker.css', 'tracker.js', 'pwa.css', 'pwa.js',
  'assets/fonts/sora-latin.woff2', 'assets/fonts/unbounded-latin.woff2',
  'sets.js', 'lib.js', 'manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});

self.addEventListener('message',event=>{
  if(event.origin===location.origin && event.data?.type==='SKIP_WAITING')
    self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== VERSION && k !== IMAGE_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

async function cacheFirstImage(request){
  const cache=await caches.open(IMAGE_CACHE);
  const hit=await cache.match(request);
  if(hit) return hit;
  try{
    const response=await fetch(request);
    // Cache real CORS responses; opaque responses carry a severe quota cost.
    if(response.ok && response.type!=='opaque'){
      await cache.put(request,response.clone());
      const keys=await cache.keys();
      if(keys.length>IMAGE_CACHE_LIMIT){
        await Promise.all(keys.slice(0,keys.length-IMAGE_CACHE_LIMIT).map(key=>cache.delete(key)));
      }
    }
    return response;
  }catch(error){
    console.warn('Card image request failed; trying the next image candidate.',error);
    return Response.error();
  }
}

async function networkFirst(request,url){
  try{
    const response=await fetch(request);
    if(response.ok && url.origin===location.origin){
      const cache=await caches.open(VERSION);
      await cache.put(request,response.clone());
    }
    return response;
  }catch(error){
    console.warn('Network request failed; using the offline cache.',error);
    return (await caches.match(request)) || Response.error();
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  const isImage=/\.(png|jpg|jpeg|webp|svg)$/.test(url.pathname);
  event.respondWith(isImage ? cacheFirstImage(event.request) : networkFirst(event.request,url));
});
