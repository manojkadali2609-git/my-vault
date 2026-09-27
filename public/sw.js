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
    const store = tx.objectStore(STORE);

    store.put(
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
    tx.onabort = () =>
      reject(tx.error || new Error("IndexedDB transaction aborted"));
  });

  db.close();
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle Android/Web Share Target POST requests.
  if (request.method !== "POST" || url.pathname !== "/share-target") {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const form = await request.formData();

        const titleValue = form.get("title");
        const textValue = form.get("text");
        const urlValue = form.get("url");

        const title =
          typeof titleValue === "string" ? titleValue : "";

        const text =
          typeof textValue === "string" ? textValue : "";

        const sharedUrl =
          typeof urlValue === "string" ? urlValue : "";

        /*
         * Android can provide shared files in slightly different
         * multipart representations. Check every value in the
         * form instead of relying only on getAll("files").
         */
        const files = [];

        for (const [key, value] of form.entries()) {
          if (value instanceof File && value.size > 0) {
            files.push(value);
          }
        }

        /*
         * Prefer the file supplied through the manifest's "files"
         * field, but fall back to any File found in the form.
         */
        let sharedFile = null;

        const declaredFiles = form
          .getAll("files")
          .filter(
            (value) => value instanceof File && value.size > 0
          );

        if (declaredFiles.length > 0) {
          sharedFile = declaredFiles[0];
        } else if (files.length > 0) {
          sharedFile = files[0];
        }

        if (sharedFile) {
          await saveSharedFile(sharedFile);
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

        /*
         * Always redirect back to the main My VaulT page.
         */
        const redirectUrl = new URL("/", url.origin);

        if (params.toString()) {
          redirectUrl.search = params.toString();
        }

        return Response.redirect(redirectUrl.href, 303);
      } catch (error) {
        console.error(
          "My VaulT share target error:",
          error
        );

        return Response.redirect(
          new URL("/", url.origin).href,
          303
        );
      }
    })()
  );
});