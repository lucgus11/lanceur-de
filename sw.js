// ---- Lance-Dé Service Worker ----
// 1) Rend l'app 100% utilisable hors-ligne (cache-first).
// 2) Gère la notification persistante et son bouton "Lancer".

const CACHE_NAME = "lance-de-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

const NOTIF_TAG = "dice-persistent";

// ---------- Installation : mise en cache de tous les fichiers ----------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// ---------- Activation : nettoyage des anciens caches ----------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ---------- Fetch : cache-first, avec repli réseau puis mise en cache ----------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});

// ---------- Utilitaire : afficher/rafraîchir la notification persistante ----------
function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

const FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

async function showPersistentNotification(value) {
  const title = value ? `Résultat : ${value}` : "Lance-Dé";
  const body = value
    ? `${FACES[value]}  Tu as fait ${value}. Relance quand tu veux.`
    : "Appuie sur « Lancer » pour jouer, sans ouvrir l'app.";

  await self.registration.showNotification(title, {
    body,
    tag: NOTIF_TAG,
    renotify: false,
    requireInteraction: true,
    silent: true,
    icon: "icon-192.png",
    badge: "icon-192.png",
    actions: [
      { action: "roll", title: "🎲 Lancer" },
      { action: "open", title: "Ouvrir l'app" }
    ],
    data: { value: value || null }
  });

  // On informe les pages ouvertes du résultat, pour synchroniser l'UI.
  const clientsList = await self.clients.matchAll({ type: "window" });
  clientsList.forEach((c) => c.postMessage({ type: "DICE_RESULT", value: value || null }));
}

// ---------- Clic sur la notification ----------
self.addEventListener("notificationclick", (event) => {
  const action = event.action;

  if (action === "open") {
    event.notification.close();
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clientsList) => {
        if (clientsList.length > 0) return clientsList[0].focus();
        return self.clients.openWindow("./index.html");
      })
    );
    return;
  }

  // Clic sur "Lancer" OU clic sur le corps de la notification -> on relance le dé
  // et on republie immédiatement la notification (persistante) avec le résultat.
  event.notification.close();
  const value = rollDie();
  event.waitUntil(showPersistentNotification(value));
});

// L'utilisateur ferme la notification manuellement : on ne la recrée pas.
self.addEventListener("notificationclose", () => {
  // no-op : respecte le choix de l'utilisateur de la fermer.
});

// ---------- Messages venant de la page (ex: activer la notification) ----------
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOW_PERSISTENT") {
    event.waitUntil(showPersistentNotification(event.data.value || null));
  }
  if (event.data && event.data.type === "ROLL_FROM_PAGE") {
    event.waitUntil(showPersistentNotification(event.data.value));
  }
});
