/* This worker caches only the public offline message. HTML and app releases stay network-first. */
const CACHE = "safaqat-offline-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE, { cache: "reload" }))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("safaqat-offline-") && key !== CACHE).map((key) => caches.delete(key)),
  )));
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const offline = await (await caches.open(CACHE)).match(OFFLINE);
    return offline || Response.error();
  }));
});
