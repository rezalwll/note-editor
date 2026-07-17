const STATIC_CACHE = "notava-static-v2";
const STATIC_ASSETS = [
  "/offline.html",
  "/brand/notava-logo.png",
  "/brand/notava-icon-192.png",
  "/brand/notava-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_PRIVATE_DATA") {
    return;
  }

  const requestId = event.data?.requestId;
  const clearPromise = caches
    .keys()
    .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    .then(() => {
      event.ports?.[0]?.postMessage({ type: "PRIVATE_DATA_CLEARED", requestId });
    });
  event.waitUntil(clearPromise);
});

function isCacheableStaticRequest(request, url) {
  return (
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/api/") &&
    ["font", "image", "script", "style"].includes(request.destination)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (!isCacheableStaticRequest(request, url)) {
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) {
        return cached;
      }

      const response = await fetch(request);
      const cacheControl = response.headers.get("cache-control") ?? "";
      if (response.ok && !/\b(?:private|no-store)\b/i.test(cacheControl)) {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
