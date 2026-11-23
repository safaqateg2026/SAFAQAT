/* Keep application navigation network-first and cache only the versioned splash and offline notice. */
const CACHE = "safaqat-offline-v5";
const OFFLINE = "/offline.html";
const SPLASH = "/images/safaqat-luminous-v4.webp";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const response = await fetch(OFFLINE, { cache: "reload" });
    if (!response.ok || new URL(response.url).origin !== self.location.origin) {
      throw new Error("Could not load the SAFAQAT offline page");
    }
    const cache = await caches.open(CACHE);
    await cache.put(OFFLINE, new Response(await response.text(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }));
    await cache.add(new Request(SPLASH, { cache: "reload" }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("safaqat-offline-") && key !== CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (url.pathname === SPLASH && !url.search) {
    event.respondWith(caches.open(CACHE).then(async (cache) =>
      (await cache.match(SPLASH)) || fetch(event.request)));
    return;
  }
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => {
    const offline = await (await caches.open(CACHE)).match(OFFLINE);
    return offline || Response.error();
  }));
});
