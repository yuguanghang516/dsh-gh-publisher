const CACHE='moge-shell-v1.0.1';
const CORE=['/','/index.html','/style.css','/app.js','/storage.js','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(CACHE);for(const url of CORE){try{const r=await fetch(url,{redirect:'follow'});if(r.ok&&!r.redirected)await c.put(url,r);}catch{}}await self.skipWaiting();})());});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('moge-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})());});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname==='/catalog.json')return;
  const navigation=e.request.mode==='navigate';
  // Full pages and archives live in IndexedDB only when explicitly saved.
  if(!navigation&&!CORE.includes(u.pathname)&&!/^\/assets\/[^/]+\/cover\.svg$/.test(u.pathname))return;
  e.respondWith((async()=>{
    const key=navigation?'/index.html':e.request;
    try{
      const response=await fetch(e.request);
      if(response.ok&&!response.redirected){const cache=await caches.open(CACHE);await cache.put(key,response.clone());}
      return response;
    }catch(error){
      const cached=await caches.match(key);
      if(cached)return cached;
      if(navigation)return new Response('请先联网打开墨格，再保存需要离线阅读的漫画。',{headers:{'Content-Type':'text/plain;charset=utf-8'}});
      throw error;
    }
  })());
});
