const cacheName = "zubora-cashflow-v2";
const assets = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./analyze.html",
  "./analyze.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets)));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    }),
  );
});
