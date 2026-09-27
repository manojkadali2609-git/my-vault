const DB_NAME = "myvault-share";
const DB_VERSION = 1;
const STORE = "inbox";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSharedFile(file) {
  const db = await openDb();
  const buffer = await file.arrayBuffer();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");

    tx.objectStore(STORE).put(
      {
        buffer,
        name: file.name || "shared-file",
        type: file.type || "application/octet-stream",
        lastModified: file.lastModified || Date.now(),
      },
      "latest"
    );

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });

  db.close();
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only intercept Android/Web Share Target POST requests.
  if (request.method !== "POST" || url.pathname !== "/share-target") {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // Read the multipart form only once.
        const form = await request.formData();

        const title = String(form.get("title") || "");
        const text = String(form.get("text") || "");
        const sharedUrl = String(form.get("url") || "");

        // Android may send one or more files.
        const files = form
          .getAll("files")
          .filter((value) => value instanceof File);

        // Save the first shared file into IndexedDB.
        if (files.length > 0) {
          await saveSharedFile(files[0]);
        }

        const params = new URLSearchParams();

        if (title) {
          params.set("shared_title", title);
        }

        if (text) {
          params.set("shared_text", text);
        }

        if (sharedUrl) {
          params.set("shared_url", sharedUrl);
        }

        const redirectUrl = new URL("/", url.origin);

        if (params.toString()) {
          redirectUrl.search = params.toString();
        }

        // 303 converts the POST into a normal GET.
        return Response.redirect(redirectUrl.href, 303);
      } catch (error) {
        console.error("My VaulT share target error:", error);

        return Response.redirect(
          new URL("/", url.origin).href,
          303
        );
      }
    })()
  );
});