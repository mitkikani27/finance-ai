/* FinMate AI — Service Worker (PWA: installable + offline app shell)
   Strategy:
   • /api/*            → network only (never cached; auth tokens must not be stored)
   • app shell "/"     → network-first, cached copy as offline fallback
   • hashed assets     → cache-first (filenames change with content)
   • icons/manifest    → cache-first                                                      */
const CACHE = "finmate-v1";
const SHELL = ["/", "/index.html", "/manifest.json",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // Clerk etc. → browser
  if (url.pathname.startsWith("/api/")) return;        // never cache API/auth data

  // hashed build assets + icons: cache-first
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // navigations / everything else: network-first, shell fallback (offline)
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === "navigate" || url.pathname === "/")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
        }
        return res;
      })
      .catch(() => caches.match("/"))                    // offline → app shell
  );
});
