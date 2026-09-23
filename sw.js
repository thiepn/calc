"use strict";
const CACHE="calc-shell-v18";
const ASSETS=["./","./index.html","./styles.css","./math.js","./algebra.js","./calculus.js","./calculus-worker.js","./units.js","./linear-algebra.js","./statistics.js","./statistics-worker.js","./graph.js","./graph-worker.js","./tools.js","./custom-tools.js","./notebook.js","./persistence.js","./app.js","./manifest.webmanifest","./icon.svg"];
const shellUrl=new URL("./index.html",self.registration.scope).href;

self.addEventListener("install",function(event){
  event.waitUntil(caches.open(CACHE).then(function(cache){return cache.addAll(ASSETS);}));
});

self.addEventListener("message",function(event){
  var message=event.data||{};
  if(message.type==="SKIP_WAITING"){self.skipWaiting();return;}
  if(message.type==="GET_VERSION"&&event.source&&event.source.postMessage)event.source.postMessage({type:"SW_VERSION",version:CACHE});
});

self.addEventListener("activate",function(event){
  event.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k.startsWith("calc-shell-")&&k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}).then(function(){return self.clients.matchAll({type:"window",includeUncontrolled:true});}).then(function(clients){clients.forEach(function(client){client.postMessage({type:"SW_ACTIVATED",version:CACHE});});}));
});

self.addEventListener("fetch",function(event){
  if(event.request.method!=="GET")return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request).then(function(response){
      var copy=response.clone();caches.open(CACHE).then(function(cache){cache.put(event.request,copy);});return response;
    }).catch(function(){return caches.match(event.request).then(function(hit){return hit||caches.match(shellUrl);});}));
    return;
  }
  event.respondWith(caches.match(event.request).then(function(hit){
    if(hit)return hit;
    return fetch(event.request).then(function(response){
      if(response&&response.ok&&new URL(event.request.url).origin===location.origin){
        var copy=response.clone();caches.open(CACHE).then(function(cache){cache.put(event.request,copy);});
      }
      return response;
    });
  }));
});