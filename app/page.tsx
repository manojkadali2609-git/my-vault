PS C:\Users\manoj\my-vault> cd C:\Users\manoj\my-vault
PS C:\Users\manoj\my-vault> Get-Content app\page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ItemType = "note" | "link" | "media" | "file";

type Item = {
  id: string;
  user_id?: string;
  type: ItemType;
  title: string;
  content: string;
  url?: string | null;
  fileName?: string | null;
  file_path?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  mediaUrl?: string | null;
  tags: string[];
  date: string;
  favorite: boolean;
  collection?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

const typeLabel: Record<ItemType, string> = {
  note: "Note",
  link: "Link",
  media: "Media",
  file: "File",
};

const typeIcon: Record<ItemType, string> = {
  note: "âœŽ",
  link: "â†—",
  media: "â—‰",
  file: "â–¡",
};

const BUCKET = "vault files";

const supabase = createClient();

function formatBytes(bytes?: number | null) {
  if (!bytes) return "";

  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function dbToItem(row: any): Item {
  return {
    id: String(row.id),
    user_id: row.user_id,
    type: row.type,
    title: row.title ?? "Untitled",
    content: row.content ?? "",
    url: row.url ?? null,
    fileName: row.file_name ?? row.fileName ?? null,
    file_path: row.file_path ?? null,
    mime_type: row.mime_type ?? null,
    file_size: row.file_size ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    favorite: Boolean(row.favorite),
    collection: row.collection ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
    date: row.created_at
      ? new Date(row.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : "Today",
  };
}

function extractUrlFromText(text: string) {
  if (!text) return "";

  const match = text.match(
    /https?:\/\/[^\s<>"'`]+/i
  );

  if (!match) return "";

  return match[0].replace(/[),.;!?]+$/, "");
}

function TrashBin({
  notify,
  onRestored,
}: {
  notify: (m: string) => void;
  onRestored: (item: Item) => void;
}) {
  const [deleted, setDeleted] = useState<Item[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (error) {
        notify(`Could not load Recycle Bin: ${error.message}`);
      } else {
        setDeleted((data ?? []).map(dbToItem));
      }

      setLoadingTrash(false);
    })();
  }, []);

  async function restore(id: string) {
    const { data, error } = await supabase
      .from("items")
      .update({
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      notify(`Could not restore: ${error.message}`);
      return;
    }

    const restored = dbToItem(data);

    setDeleted((d) => d.filter((x) => x.id !== id));
    onRestored(restored);
    notify("Item restored");
  }

  async function purge(id: string) {
    if (
      !window.confirm(
        "Permanently delete this item? This cannot be undone."
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("items")
      .delete()
      .eq("id", id);

    if (error) {
      notify(`Could not permanently delete: ${error.message}`);
      return;
    }

    setDeleted((d) => d.filter((x) => x.id !== id));
    notify("Permanently deleted");
  }

  if (loadingTrash) {
    return (
      <div className="empty">
        <div>â—Œ</div>
        <h3>Loading Recycle Binâ€¦</h3>
        <p>Checking deleted items.</p>
      </div>
    );
  }

  if (!deleted.length) {
    return (
      <div className="empty">
        <div>â™»</div>
        <h3>Recycle Bin is empty</h3>
        <p>Deleted items can be restored for 30 days.</p>
      </div>
    );
  }

  return (
    <div className="cards">
      {deleted.map((x) => (
        <article className="card" key={x.id}>
          <div className="card-top">
            <span className="type-badge">
              {typeIcon[x.type]} {typeLabel[x.type]}
            </span>
          </div>

          <div className="card-body">
            <h3>{x.title}</h3>
            <p>{x.content}</p>

            <div className="card-foot">
              <span>
                Deleted{" "}
                {x.deleted_at
                  ? new Date(x.deleted_at).toLocaleDateString()
                  : ""}
              </span>

              <div className="card-actions">
                <button
                  title="Restore"
                  onClick={() => restore(x.id)}
                >
                  â†¶
                </button>

                <button
                  title="Permanently delete"
                  className="danger-action"
                  onClick={() => purge(x.id)}
                >
                  âŒ«
                </button>
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function Page() {
  const [items, setItems] = useState<Item[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | null>(
    null
  );
  const [view, setView] = useState("all");
  const [filter, setFilter] = useState("all");
  const [tag, setTag] = useState("all");
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [modal, setModal] = useState<
    "capture" | "editor" | "viewer" | "settings" | "account" | null
  >(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewerItem, setViewerItem] = useState<Item | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [themeReady, setThemeReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    tags: "",
    url: "",
    content: "",
  });

  const shareProcessing = useRef(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!active) return;

      const user = sessionData.session?.user ?? null;

      if (sessionError) {
        setAuthError(sessionError.message);
        setAuthRequired(true);
        setLoading(false);
        return;
      }

      if (!user) {
        setUserId("");
        setUserEmail("");
        setItems([]);
        setCollections([]);
        setAuthRequired(true);
        setLoading(false);
        return;
      }

      setAuthRequired(false);
      setUserId(user.id);
      setUserEmail(user.email ?? "");

      const [
        { data, error },
        { data: collectionRows, error: collectionError },
      ] = await Promise.all([
        supabase
          .from("items")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),

        supabase
          .from("collections")
          .select("name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
      ]);

      if (!active) return;

      if (error) {
        notify(`Could not load vault: ${error.message}`);
      } else {
        setItems(await addSignedUrls((data ?? []).map(dbToItem)));
      }

      if (!collectionError && collectionRows) {
        setCollections(
          collectionRows.map((row: { name: string }) => row.name)
        );
      } else {
        const savedCollections =
          window.localStorage.getItem("myvault-collections");

        if (savedCollections) {
          try {
            setCollections(JSON.parse(savedCollections));
          } catch {}
        }
      }

      const savedTheme =
        window.localStorage.getItem("myvault-theme") as
          | "dark"
          | "light"
          | null;

      if (savedTheme === "dark" || savedTheme === "light") {
        setTheme(savedTheme);
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "myvault-collections",
      JSON.stringify(collections)
    );
  }, [collections]);

  useEffect(() => {
    const savedTheme =
      window.localStorage.getItem("myvault-theme") as
        | "dark"
        | "light"
        | null;

    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }

    setThemeReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    if (themeReady) {
      window.localStorage.setItem("myvault-theme", theme);
    }
  }, [theme, themeReady]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {});
    }
  }, []);

  async function processSharedFile(file: File) {
    return await handleSelectedFile(file);
  }

  async function processIncomingShare() {
    if (!userId || shareProcessing.current) return;

    shareProcessing.current = true;

    try {
      const params = new URLSearchParams(window.location.search);

      const sharedUrlParam =
        params.get("shared_url")?.trim() ?? "";

      const sharedText =
        params.get("shared_text")?.trim() ?? "";

      const sharedTitle =
        params.get("shared_title")?.trim() ?? "";

      const extractedUrl =
        sharedUrlParam || extractUrlFromText(sharedText);

      const cleanText =
        sharedText && extractedUrl
          ? sharedText.replace(extractedUrl, "").trim()
          : sharedText;

      if (extractedUrl || sharedText || sharedTitle) {
        setForm({
          title:
            sharedTitle ||
            (extractedUrl
              ? "Shared link"
              : "Shared text"),
          tags: "Shared",
          url: extractedUrl,
          content:
            cleanText ||
            extractedUrl,
        });

        setEditingId(null);
        setModal("editor");

        window.history.replaceState(
          {},
          "",
          window.location.pathname
        );

        notify(
          extractedUrl
            ? "Shared link detected"
            : "Shared content detected"
        );
      }

      if (!("indexedDB" in window)) {
        return;
      }

      const db = await new Promise<IDBDatabase>(
        (resolve, reject) => {
          const request = indexedDB.open(
            "myvault-share",
            1
          );

          request.onsuccess = () => {
            resolve(request.result);
          };

          request.onerror = () => {
            reject(
              request.error ||
                new Error(
                  "Could not open share inbox"
                )
            );
          };
        }
      );

      if (!db.objectStoreNames.contains("inbox")) {
        db.close();
        return;
      }

      const value = await new Promise<any>(
        (resolve, reject) => {
          const tx = db.transaction(
            "inbox",
            "readonly"
          );

          const get = tx
            .objectStore("inbox")
            .get("latest");

          get.onsuccess = () => {
            resolve(get.result);
          };

          get.onerror = () => {
            reject(
              get.error ||
                new Error(
                  "Could not read shared file"
                )
            );
          };
        }
      );

      if (!value?.buffer) {
        db.close();
        return;
      }

      const file = new File(
        [value.buffer],
        value.name || "shared-file",
        {
          type:
            value.type ||
            "application/octet-stream",
          lastModified:
            value.lastModified || Date.now(),
        }
      );

      const saved =
        await processSharedFile(file);

      if (saved) {
        await new Promise<void>(
          (resolve, reject) => {
            const tx = db.transaction(
              "inbox",
              "readwrite"
            );

            tx.objectStore("inbox").delete(
              "latest"
            );

            tx.oncomplete = () => {
              resolve();
            };

            tx.onerror = () => {
              reject(
                tx.error ||
                  new Error(
                    "Could not clear share inbox"
                  )
              );
            };

            tx.onabort = () => {
              reject(
                tx.error ||
                  new Error(
                    "Share inbox transaction aborted"
                  )
              );
            };
          }
        );
      }

      db.close();
    } catch (error) {
      console.error(
        "My VaulT could not process incoming share:",
        error
      );

      notify(
        "The shared file could not be saved."
      );
    } finally {
      shareProcessing.current = false;
    }
  }

  useEffect(() => {
    void processIncomingShare();
  }, [userId]);

  async function signIn() {
    const email = authEmail.trim();

    if (!email || !authPassword) {
      setAuthError("Enter your email and password.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");

    const {
      data,
      error,
    } = await supabase.auth.signInWithPassword({
      email,
      password: authPassword,
    });

    if (error || !data.user) {
      setAuthBusy(false);
      setAuthError(
        error?.message ?? "Could not sign in."
      );
      return;
    }

    setUserId(data.user.id);
    setUserEmail(data.user.email ?? "");
    setAuthPassword("");
    setAuthRequired(false);
    setAuthBusy(false);
    setLoading(true);

    const [
      { data: itemRows, error: itemError },
      { data: collectionRows, error: collectionError },
    ] = await Promise.all([
      supabase
        .from("items")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),

      supabase
        .from("collections")
        .select("name")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: true }),
    ]);

    if (itemError) {
      notify(`Could not load vault: ${itemError.message}`);
    } else {
      setItems(
        await addSignedUrls(
          (itemRows ?? []).map(dbToItem)
        )
      );
    }

    if (!collectionError) {
      setCollections(
        (collectionRows ?? []).map(
          (row: { name: string }) => row.name
        )
      );
    }

    setLoading(false);
  }

  const viewToType: Record<
    string,
    ItemType | undefined
  > = {
    notes: "note",
    links: "link",
    media: "media",
    files: "file",
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    let result = items.filter((x) => {
      const requestedType = viewToType[view];

      const viewOK =
        view === "all" ||
        (view === "favorites"
          ? x.favorite
          : requestedType
          ? x.type === requestedType
          : true);

      const filterOK =
        filter === "all" ||
        (filter === "favorites" ? x.favorite : true);

      const tagOK =
        tag === "all" || x.tags.includes(tag);

      const collectionOK =
        !activeCollection ||
        x.collection === activeCollection;

      const haystack = [
        x.title,
        x.content,
        x.url ?? "",
        x.type,
        x.fileName ?? "",
        ...x.tags,
      ]
        .join(" ")
        .toLowerCase();

      return (
        viewOK &&
        filterOK &&
        tagOK &&
        collectionOK &&
        (!q || haystack.includes(q))
      );
    });

    if (filter === "recent") {
      result = result.slice(0, 6);
    }

    return result;
  }, [
    items,
    view,
    filter,
    tag,
    search,
    activeCollection,
  ]);

  function notify(message: string) {
    setToast(message);

    window.setTimeout(() => {
      setToast("");
    }, 2200);
  }

  async function addSignedUrls(rows: Item[]) {
    const paths = rows
      .map((x) => x.file_path)
      .filter(Boolean) as string[];

    if (!paths.length) return rows;

    const {
      data,
      error,
    } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, 60 * 60);

    if (error) {
      notify(
        `Could not prepare file previews: ${error.message}`
      );

      return rows;
    }

    const map = new Map<string, string>();

    (data ?? []).forEach(
      (entry: any, i: number) => {
        if (entry?.signedUrl) {
          map.set(paths[i], entry.signedUrl);
        }
      }
    );

    return rows.map((x) => ({
      ...x,
      mediaUrl: x.file_path
        ? map.get(x.file_path) ?? null
        : null,
    }));
  }

  function isImage(item: Item) {
    return !!item.mime_type?.startsWith("image/");
  }

  function isVideo(item: Item) {
    return !!item.mime_type?.startsWith("video/");
  }

  function isAudio(item: Item) {
    return !!item.mime_type?.startsWith("audio/");
  }

  function openEditor(item: Item) {
    setEditingId(item.id);

    setForm({
      title: item.title,
      tags: item.tags.join(", "),
      url: item.url ?? "",
      content: item.content,
    });

    setModal("editor");
  }

  async function createItem(
    type: ItemType,
    selectedFile?: File
  ): Promise<boolean> {
    const {
      data: sessionData,
    } = await supabase.auth.getSession();

    const user = sessionData.session?.user;

    if (!user) {
      setAuthRequired(true);
      notify("Please sign in first");
      return false;
    }

    setSaving(true);

    let filePath: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;
    let actualType = type;

    if (selectedFile) {
      const safeName = selectedFile.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "-"
      );

      filePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      fileName = selectedFile.name;
      mimeType =
        selectedFile.type ||
        "application/octet-stream";
      fileSize = selectedFile.size;

      actualType =
        mimeType.startsWith("image/") ||
        mimeType.startsWith("video/") ||
        mimeType.startsWith("audio/")
          ? "media"
          : "file";

      const {
        error: uploadError,
      } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, selectedFile, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        setSaving(false);

        notify(
          `Upload failed: ${uploadError.message}`
        );

        return false;
      }
    }

    const payload: any = {
      user_id: user.id,
      type: actualType,
      title:
        selectedFile?.name ??
        `New ${typeLabel[actualType]}`,
      content: selectedFile
        ? `Uploaded file: ${selectedFile.name}`
        : "Start adding your content here.",
      tags: ["New"],
      favorite: false,
      collection: activeCollection,
      ...(actualType === "link"
        ? { url: "https://" }
        : {}),
      ...(selectedFile
        ? {
            file_path: filePath,
            file_name: fileName,
            mime_type: mimeType,
            file_size: fileSize,
          }
        : {}),
    };

    const {
      data,
      error,
    } = await supabase
      .from("items")
      .insert(payload)
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      if (filePath) {
        await supabase.storage
          .from(BUCKET)
          .remove([filePath]);
      }

      notify(
        `Could not save: ${error.message}`
      );

      return false;
    }

    const item = (
      await addSignedUrls([dbToItem(data)])
    )[0];

    setItems((current) => [
      item,
      ...current,
    ]);

    setModal(null);
    setView("all");
    setFilter("all");
    setTag("all");

    if (selectedFile) {
      notify(
        `${selectedFile.name} uploaded successfully`
      );

      return true;
    }

    setEditingId(item.id);

    setForm({
      title: item.title,
      tags: item.tags.join(", "),
      url: item.url ?? "",
      content: item.content,
    });

    setModal("editor");

    return true;
  }

  async function handleSelectedFile(file: File) {
    return await createItem("file", file);
  }

  async function saveEdit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    if (!editingId) return;

    setSaving(true);

    const current = items.find(
      (x) => x.id === editingId
    );

    const updates: any = {
      title:
        form.title.trim() || "Untitled",
      tags: form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      content: form.content.trim(),
      updated_at:
        new Date().toISOString(),
    };

    if (current?.type === "link") {
      updates.url = form.url.trim();
    }

    const {
      data,
      error,
    } = await supabase
      .from("items")
      .update(updates)
      .eq("id", editingId)
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      notify(
        `Could not save: ${error.message}`
      );

      return;
    }

    setItems((currentItems) =>
      currentItems.map((x) =>
        x.id === editingId
          ? dbToItem(data)
          : x
      )
    );

    setModal(null);

    notify("Saved to your vault");
  }

  async function saveSharedContent(
    e: React.FormEvent
  ) {
    e.preventDefault();

    const title =
      form.title.trim() ||
      (form.url.trim()
        ? "Shared link"
        : "Shared text");

    const content =
      form.content.trim() ||
      form.url.trim();

    const url =
      form.url.trim() || null;

    const {
      data: sessionData,
    } = await supabase.auth.getSession();

    const user =
      sessionData.session?.user;

    if (!user) {
      setAuthRequired(true);
      notify("Please sign in first");
      return;
    }

    setSaving(true);

    const payload: any = {
      user_id: user.id,
      type: url ? "link" : "note",
      title,
      content,
      tags: form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      favorite: false,
      collection: activeCollection,
      ...(url ? { url } : {}),
    };

    const {
      data,
      error,
    } = await supabase
      .from("items")
      .insert(payload)
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      notify(
        `Could not save shared content: ${error.message}`
      );

      return;
    }

    const item = dbToItem(data);

    setItems((current) => [
      item,
      ...current,
    ]);

    setModal(null);
    setEditingId(null);
    setForm({
      title: "",
      tags: "",
      url: "",
      content: "",
    });

    setView("all");
    setFilter("all");
    setTag("all");

    notify(
      url
        ? "Link saved to your vault"
        : "Shared content saved"
    );
  }

  async function toggleFavorite(
    id: string
  ) {
    const item = items.find(
      (x) => x.id === id
    );

    if (!item) return;

    const {
      data,
      error,
    } = await supabase
      .from("items")
      .update({
        favorite: !item.favorite,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      notify(
        `Could not update favorite: ${error.message}`
      );

      return;
    }

    setItems((current) =>
      current.map((x) =>
        x.id === id
          ? dbToItem(data)
          : x
      )
    );
  }

  async function deleteItem(
    id: string
  ) {
    if (
      !window.confirm(
        "Move this item to Recycle Bin? It can be restored for 30 days."
      )
    ) {
      return;
    }

    const deletedAt =
      new Date().toISOString();

    const {
      error,
    } = await supabase
      .from("items")
      .update({
        deleted_at: deletedAt,
        updated_at: deletedAt,
      })
      .eq("id", id);

    if (error) {
      notify(
        `Could not move to Recycle Bin: ${error.message}`
      );

      return;
    }

    setItems((current) =>
      current.filter(
        (x) => x.id !== id
      )
    );

    notify("Moved to Recycle Bin");
  }

  async function moveToCollection(
    id: string,
    collection: string
  ) {
    const clean = collection.trim();

    if (!clean) return;

    const {
      data,
      error,
    } = await supabase
      .from("items")
      .update({
        collection: clean,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      notify(
        `Could not move item: ${error.message}`
      );

      return;
    }

    setItems((current) =>
      current.map((x) =>
        x.id === id
          ? dbToItem(data)
          : x
      )
    );

    notify(`Moved to ${clean}`);
  }

  function handleCollectionDragOver(
    e: React.DragEvent
  ) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleCollectionDrop(
    e: React.DragEvent,
    collection: string
  ) {
    e.preventDefault();

    const id =
      e.dataTransfer.getData(
        "text/my-vault-item"
      ) ||
      e.dataTransfer.getData(
        "text/plain"
      );

    if (id) {
      await moveToCollection(
        id,
        collection
      );
    } else {
      notify(
        "Drag a card from the vault onto a collection."
      );
    }
  }

  async function createCollection() {
    const name =
      window.prompt("Collection name");

    if (!name?.trim()) return;

    const clean = name.trim();

    if (
      collections.some(
        (c) =>
          c.toLowerCase() ===
          clean.toLowerCase()
      )
    ) {
      const existing =
        collections.find(
          (c) =>
            c.toLowerCase() ===
            clean.toLowerCase()
        )!;

      setActiveCollection(existing);
      notify(
        "That collection already exists"
      );

      return;
    }

    const {
      data: sessionData,
    } = await supabase.auth.getSession();

    const user =
      sessionData.session?.user;

    if (!user) {
      setAuthRequired(true);
      notify("Please sign in again.");
      return;
    }

    const {
      error,
    } = await supabase
      .from("collections")
      .insert({
        user_id: user.id,
        name: clean,
      });

    if (error) {
      notify(
        `Could not save collection: ${error.message}`
      );

      return;
    }

    setCollections((current) => [
      ...current,
      clean,
    ]);

    setActiveCollection(clean);

    notify(
      `Collection "${clean}" created â€” you can drag cards here or use Moveâ€¦`
    );
  }

  function openItem(item: Item) {
    if (item.mediaUrl) {
      setViewerItem(item);
      setModal("viewer");
      return;
    }

    if (
      item.url &&
      item.url !== "https://"
    ) {
      if (
        !window.confirm(
          `Open this link in a new tab?\n\n${item.url}`
        )
      ) {
        return;
      }

      window.open(
        item.url,
        "_blank",
        "noopener,noreferrer"
      );

      return;
    }

    if (item.file_path) {
      void (async () => {
        const {
          data,
          error,
        } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(
            item.file_path!,
            60 * 60
          );

        if (
          error ||
          !data?.signedUrl
        ) {
          notify(
            `Could not open file: ${
              error?.message ??
              "No secure file URL"
            }`
          );

          return;
        }

        if (
          !window.confirm(
            `Open â€œ${
              item.fileName ??
              item.title
            }â€ in a new tab?`
          )
        ) {
          return;
        }

        window.open(
          data.signedUrl,
          "_blank",
          "noopener,noreferrer"
        );
      })();

      return;
    }

    openEditor(item);
  }

  const title = search
    ? `Results for â€œ${search}â€`
    : (
        {
          all: "Everything worth keeping.",
          notes: "Your notes, organized.",
          links: "Links worth returning to.",
          media: "Your saved media.",
          files: "Files in your vault.",
          favorites:
            "Your saved favorites.",
          trash:
            "Recently deleted items.",
        } as Record<string, string>
      )[view] ??
      "Everything worth keeping.";

  const setViewAndReset = (
    next: string
  ) => {
    setView(next);
    setFilter("all");
    setTag("all");
    setActiveCollection(null);
    setMobileMenuOpen(false);
  };

  const contextualCaptureLabel =
    view === "notes"
      ? "ï¼‹ Add note"
      : view === "links"
      ? "ï¼‹ Add URL"
      : view === "media"
      ? "ï¼‹ Add media"
      : view === "files"
      ? "ï¼‹ Upload file"
      : view === "favorites"
      ? "ï¼‹ Capture favorite"
      : view === "trash"
      ? "Recycle Bin"
      : activeCollection
      ? `ï¼‹ Add to ${activeCollection}`
      : "ï¼‹ Capture";

  if (authRequired) {
    return (
      <div className="app-shell auth-screen">
        <style>{`
          .auth-screen{min-height:100dvh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top left,rgba(255,120,70,.16),transparent 34%),radial-gradient(circle at bottom right,rgba(55,120,255,.14),transparent 38%),var(--bg,#f7f8fb);}
          .auth-card{width:min(420px,calc(100vw - 32px));padding:34px;border-radius:28px;background:rgba(255,255,255,.88);border:1px solid rgba(20,30,50,.10);box-shadow:0 24px 70px rgba(20,30,50,.14);backdrop-filter:blur(18px);}
          [data-theme="dark"] .auth-card{background:rgba(20,24,34,.90);border-color:rgba(255,255,255,.10);box-shadow:0 24px 70px rgba(0,0,0,.35);}
          .auth-logo{margin-bottom:20px;}
          .auth-kicker{font-size:11px;font-weight:800;letter-spacing:.16em;opacity:.58;margin-bottom:8px;}
          .auth-card h1{margin:0 0 8px;font-size:30px;letter-spacing:-.04em;}
          .auth-card>p{margin:0 0 24px;line-height:1.55;opacity:.68;}
          .auth-card form{display:grid;gap:14px;}
          .auth-card label{display:grid;gap:7px;font-size:13px;font-weight:700;}
          .auth-card input{width:100%;box-sizing:border-box;border:1px solid rgba(80,90,110,.18);border-radius:13px;padding:13px 14px;background:rgba(255,255,255,.72);color:inherit;outline:none;font:inherit;}
          [data-theme="dark"] .auth-card input{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);}
          .auth-card input:focus{border-color:#5c8cff;box-shadow:0 0 0 3px rgba(92,140,255,.14);}
          .auth-submit{width:100%;margin-top:3px;min-height:46px;border:0;border-radius:14px;cursor:pointer;font-weight:800;}
          .auth-error{padding:11px 12px;border-radius:12px;background:rgba(220,60,60,.10);color:#c53a3a;font-size:13px;line-height:1.4;}
          .auth-note{display:block;margin-top:18px;opacity:.52;line-height:1.45;}
        `}</style>

        <main className="auth-card">
          <div className="brand-mark auth-logo">
            <span />
            <i />
          </div>

          <div className="auth-kicker">
            PRIVATE CLOUD VAULT
          </div>

          <h1>Welcome to My VaulT</h1>

          <p>
            Sign in to access your private
            notes, files, media and collections.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void signIn();
            }}
          >
            <label>
              Email
              <input
                type="email"
                value={authEmail}
                onChange={(e) =>
                  setAuthEmail(e.target.value)
                }
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(e) =>
                  setAuthPassword(
                    e.target.value
                  )
                }
                autoComplete="current-password"
                placeholder="Your password"
              />
            </label>

            {authError && (
              <div className="auth-error">
                {authError}
              </div>
            )}

            <button
              className="primary auth-submit"
              type="submit"
              disabled={authBusy}
            >
              {authBusy
                ? "Signing inâ€¦"
                : "Sign in"}
            </button>
          </form>

          <small className="auth-note">
            Your vault data remains protected
            by your Supabase account and database
            access policies.
          </small>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() =>
            setViewAndReset("all")
          }
          aria-label="Go home"
        >
          <div className="brand-mark">
            <span />
            <i />
          </div>

          <div>
            <strong>My VaulT</strong>
            <small>
              Personal knowledge vault
            </small>
          </div>
        </button>

        <button
          className="capture-btn"
          onClick={() =>
            setModal("capture")
          }
          disabled={saving}
        >
          <span className="plus">+</span>
          <span>Capture</span>
          <kbd>C</kbd>
        </button>

        <nav className="nav">
          {[
            [
              "all",
              "âŒ‚",
              "All items",
              items.length,
            ],
            [
              "notes",
              "â–¤",
              "Notes",
              items.filter(
                (x) => x.type === "note"
              ).length,
            ],
            [
              "links",
              "â†—",
              "Links",
              items.filter(
                (x) => x.type === "link"
              ).length,
            ],
            [
              "media",
              "â—‰",
              "Media",
              items.filter(
                (x) => x.type === "media"
              ).length,
            ],
            [
              "files",
              "â–¡",
              "Files",
              items.filter(
                (x) => x.type === "file"
              ).length,
            ],
            [
              "favorites",
              "â˜…",
              "Favorites",
              items.filter(
                (x) => x.favorite
              ).length,
            ],
            [
              "trash",
              "â™»",
              "Recycle Bin",
              "",
            ],
          ].map(
            ([
              key,
              icon,
              label,
              count,
            ]) => (
              <button
                key={String(key)}
                className={`nav-item ${
                  view === key
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setViewAndReset(
                    String(key)
                  )
                }
              >
                <span>{icon}</span>
                <b>{label}</b>
                <em>{count}</em>
              </button>
            )
          )}
        </nav>

        <div className="sidebar-section">
          <div className="section-label">
            Collections
          </div>

          {collections.length === 0 && (
            <div className="collection-empty">
              Create a collection, then
              drag a card here.
            </div>
          )}

          {collections.map((x) => (
            <button
              className={`collection ${
                activeCollection === x
                  ? "active"
                  : ""
              }`}
              key={x}
              onClick={() =>
                setActiveCollection(
                  activeCollection === x
                    ? null
                    : x
                )
              }
              onDragOver={
                handleCollectionDragOver
              }
              onDrop={(e) =>
                handleCollectionDrop(
                  e,
                  x
                )
              }
            >
              <i />
              {x}
              <small>Drop</small>
            </button>
          ))}

          <button
            className="new-collection"
            onClick={createCollection}
          >
            ï¼‹ New collection
          </button>
        </div>

        <div className="sidebar-bottom">
          <button
            className="mini-nav"
            onClick={() =>
              setTheme(
                theme === "dark"
                  ? "light"
                  : "dark"
              )
            }
          >
            <span>â—</span>
            Appearance
            <small>
              {theme === "dark"
                ? "Dark"
                : "Light"}
            </small>
          </button>

          <button
            className="mini-nav"
            onClick={() =>
              setModal("settings")
            }
          >
            <span>âš™</span>
            Settings
          </button>

          <button
            className="account"
            onClick={() =>
              setModal("account")
            }
          >
            <div className="avatar">
              M
            </div>

            <div>
              <b>Manoj</b>
              <small>
                {userEmail ||
                  "Signed in"}
              </small>
            </div>

            <span>â€¢â€¢â€¢</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu-btn"
            onClick={() =>
              setMobileMenuOpen(true)
            }
            aria-label="Open navigation"
          >
            â˜°
          </button>

          <button
            className="mobile-brand"
            onClick={() =>
              setViewAndReset("all")
            }
          >
            <div className="brand-mark">
              <span />
              <i />
            </div>

            <strong>My VaulT</strong>
          </button>

          <div className="breadcrumbs">
            <span>Vault</span>
            <i>/</i>
            <b>
              {view === "all"
                ? "All items"
                : view[0].toUpperCase() +
                  view.slice(1)}
            </b>
          </div>

          <div className="top-actions">
            <button
              className="icon-btn"
              onClick={() =>
                document
                  .getElementById(
                    "vault-search"
                  )
                  ?.focus()
              }
            >
              âŒ•
            </button>

            <button
              className="icon-btn"
              onClick={() =>
                setModal("settings")
              }
            >
              âš™
            </button>

            <button
              className="profile"
              onClick={() =>
                setModal("account")
              }
            >
              M
            </button>
          </div>
        </header>

        <section className="content">
          <div className="section-capture-row">
            <button
              className="context-capture-btn"
              onClick={() =>
                setModal("capture")
              }
              disabled={
                saving ||
                view === "trash"
              }
            >
              {contextualCaptureLabel}
            </button>

            <span>
              Save something new without
              leaving this section.
            </span>
          </div>

          <div className="hero">
            <div>
              <div className="eyebrow">
                <span className="live-dot" />{" "}
                {loading
                  ? "Loading your vault"
                  : "Your vault is ready"}
              </div>

              <h1>{title}</h1>

              <p>
                Capture ideas, links, files
                and media. Find them instantly
                when you need them.
              </p>
            </div>

            <div className="hero-stat">
              <strong>
                {items.length}
              </strong>
              <span>saved items</span>
            </div>
          </div>

          <div className="toolbar">
            <div className="search-wrap">
              <span>âŒ•</span>

              <input
                id="vault-search"
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                placeholder="Search your vault..."
                autoComplete="off"
              />

              <kbd>âŒ˜ K</kbd>
            </div>

            <div className="toolbar-actions">
              {[
                "all",
                "recent",
                "favorites",
              ].map((x) => (
                <button
                  key={x}
                  className={`filter-btn ${
                    filter === x
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setFilter(x)
                  }
                >
                  {x === "favorites"
                    ? "â˜…"
                    : x[0].toUpperCase() +
                      x.slice(1)}
                </button>
              ))}

              <button
                className={`view-btn ${
                  layout === "grid"
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setLayout("grid")
                }
              >
                â–¦
              </button>

              <button
                className={`view-btn ${
                  layout === "list"
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setLayout("list")
                }
              >
                â˜·
              </button>
            </div>
          </div>

          <div className="chip-row">
            {[
              "all",
              "EV",
              "Battery",
              "Engineering",
              "Project",
            ].map((x) => (
              <button
                key={x}
                className={`chip ${
                  tag === x
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setTag(x)
                }
              >
                {x === "all"
                  ? "All"
                  : x}
              </button>
            ))}
          </div>

          <div className="result-meta">
            <span>
              {activeCollection
                ? `Collection: ${activeCollection} Â· `
                : ""}
              {filtered.length}{" "}
              {filtered.length === 1
                ? "item"
                : "items"}
            </span>

            <button
              onClick={() =>
                setSearch("")
              }
            >
              Clear search
            </button>
          </div>

          {loading ? (
            <div className="empty">
              <div>â—Œ</div>
              <h3>
                Loading your vaultâ€¦
              </h3>
              <p>
                Fetching your saved items
                securely.
              </p>
            </div>
          ) : view === "trash" ? (
            <TrashBin
              notify={notify}
              onRestored={(restored) => {
                setItems((current) => [
                  restored,
                  ...current.filter(
                    (x) =>
                      x.id !==
                      restored.id
                  ),
                ]);

                setView("all");

                setActiveCollection(
                  restored.collection ??
                    null
                );
              }}
            />
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div>âŒ•</div>

              <h3>
                {search
                  ? "No matching items"
                  : "Your vault is empty"}
              </h3>

              <p>
                {search
                  ? "Try another keyword, tag, or content type."
                  : "Use Capture to add your first item."}
              </p>
            </div>
          ) : (
            <div
              className={`cards ${
                layout === "list"
                  ? "list"
                  : ""
              }`}
            >
              {filtered.map((x) => (
                <article
                  className="card"
                  key={x.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "text/my-vault-item",
                      x.id
                    );

                    e.dataTransfer.setData(
                      "text/plain",
                      x.id
                    );

                    e.dataTransfer.effectAllowed =
                      "move";
                  }}
                >
                  <div
                    className={`card-top ${
                      x.mediaUrl
                        ? "has-media"
                        : ""
                    }`}
                  >
                    {x.mediaUrl &&
                      isImage(x) && (
                        <img
                          src={x.mediaUrl}
                          alt=""
                          loading="lazy"
                        />
                      )}

                    {x.mediaUrl &&
                      isVideo(x) && (
                        <video
                          src={x.mediaUrl}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      )}

                    <span className="type-badge">
                      {typeIcon[x.type]}{" "}
                      {typeLabel[x.type]}
                    </span>

                    <button
                      className={`favorite ${
                        x.favorite
                          ? "on"
                          : ""
                      }`}
                      onClick={() =>
                        toggleFavorite(
                          x.id
                        )
                      }
                    >
                      {x.favorite
                        ? "â˜…"
                        : "â˜†"}
                    </button>
                  </div>

                  <div className="card-body">
                    <h3>{x.title}</h3>

                    <p>
                      {x.fileName
                        ? `${x.fileName}${
                            x.file_size
                              ? ` Â· ${formatBytes(
                                  x.file_size
                                )}`
                              : ""
                          }`
                        : x.content}
                    </p>

                    <div className="tags">
                      {x.tags.map((t) => (
                        <span
                          className="tag"
                          key={t}
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    <div className="card-foot">
                      <span>{x.date}</span>

                      <div className="card-actions">
                        <button
                          title="Edit"
                          onClick={() =>
                            openEditor(x)
                          }
                        >
                          âœŽ
                        </button>

                        <button
                          title="Open"
                          onClick={() =>
                            openItem(x)
                          }
                        >
                          â†—
                        </button>

                        {collections.length >
                          0 && (
                          <select
                            className="collection-select"
                            value={
                              x.collection ??
                              ""
                            }
                            onChange={(e) => {
                              const value =
                                e.target.value;

                              if (value) {
                                moveToCollection(
                                  x.id,
                                  value
                                );
                              }
                            }}
                            title="Move to collection"
                          >
                            <option value="">
                              Moveâ€¦
                            </option>

                            {collections.map(
                              (c) => (
                                <option
                                  key={c}
                                  value={c}
                                >
                                  {c}
                                </option>
                              )
                            )}
                          </select>
                        )}

                        <button
                          title="Delete"
                          className="danger-action"
                          onClick={() =>
                            deleteItem(
                              x.id
                            )
                          }
                        >
                          âŒ«
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <nav className="mobile-nav">
        <button
          className={`mobile-nav-item ${
            view === "all"
              ? "active"
              : ""
          }`}
          onClick={() =>
            setViewAndReset("all")
          }
        >
          <span>âŒ‚</span>
          <small>Home</small>
        </button>

        <button
          className={`mobile-nav-item ${
            view === "notes"
              ? "active"
              : ""
          }`}
          onClick={() =>
            setViewAndReset("notes")
          }
        >
          <span>â–¤</span>
          <small>Notes</small>
        </button>

        <button
          className="mobile-capture"
          onClick={() =>
            setModal("capture")
          }
        >
          <span>+</span>
        </button>

        <button
          className={`mobile-nav-item ${
            view === "favorites"
              ? "active"
              : ""
          }`}
          onClick={() =>
            setViewAndReset(
              "favorites"
            )
          }
        >
          <span>â˜…</span>
          <small>Saved</small>
        </button>

        <button
          className="mobile-nav-item"
          onClick={() =>
            setMobileMenuOpen(true)
          }
        >
          <span>â˜°</span>
          <small>Menu</small>
        </button>
      </nav>

      {mobileMenuOpen && (
        <div
          className="mobile-drawer-backdrop"
          onMouseDown={(e) =>
            e.target ===
              e.currentTarget &&
            setMobileMenuOpen(false)
          }
        >
          <aside className="mobile-drawer">
            <div className="mobile-drawer-head">
              <div className="brand-mark">
                <span />
                <i />
              </div>

              <div>
                <strong>
                  My VaulT
                </strong>

                <small>
                  Personal knowledge vault
                </small>
              </div>

              <button
                onClick={() =>
                  setMobileMenuOpen(false)
                }
              >
                Ã—
              </button>
            </div>

            <button
              className="drawer-capture"
              onClick={() => {
                setMobileMenuOpen(false);
                setModal("capture");
              }}
            >
              ï¼‹ Capture
            </button>

            <div className="drawer-section-label">
              Vault
            </div>

            <nav className="drawer-nav">
              {[
                [
                  "all",
                  "âŒ‚",
                  "All items",
                  items.length,
                ],
                [
                  "notes",
                  "â–¤",
                  "Notes",
                  items.filter(
                    (x) =>
                      x.type === "note"
                  ).length,
                ],
                [
                  "links",
                  "â†—",
                  "Links",
                  items.filter(
                    (x) =>
                      x.type === "link"
                  ).length,
                ],
                [
                  "media",
                  "â—‰",
                  "Media",
                  items.filter(
                    (x) =>
                      x.type === "media"
                  ).length,
                ],
                [
                  "files",
                  "â–¡",
                  "Files",
                  items.filter(
                    (x) =>
                      x.type === "file"
                  ).length,
                ],
                [
                  "favorites",
                  "â˜…",
                  "Favorites",
                  items.filter(
                    (x) => x.favorite
                  ).length,
                ],
                [
                  "trash",
                  "â™»",
                  "Recycle Bin",
                  "",
                ],
              ].map(
                ([
                  key,
                  icon,
                  label,
                  count,
                ]) => (
                  <button
                    key={String(key)}
                    className={
                      view === key
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setViewAndReset(
                        String(key)
                      )
                    }
                  >
                    <span>{icon}</span>
                    <b>{label}</b>
                    <em>{count}</em>
                  </button>
                )
              )}
            </nav>

            <div className="drawer-section-label">
              Collections
            </div>

            <div className="drawer-collections">
              {collections.map((c) => (
                <button
                  key={c}
                  className={
                    activeCollection ===
                    c
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    setActiveCollection(
                      activeCollection ===
                        c
                        ? null
                        : c
                    );

                    setMobileMenuOpen(
                      false
                    );
                  }}
                >
                  <i />
                  {c}
                </button>
              ))}

              <button
                className="drawer-new"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void createCollection();
                }}
              >
                ï¼‹ New collection
              </button>
            </div>

            <div className="drawer-footer">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setModal("settings");
                }}
              >
                âš™ Settings
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setModal("account");
                }}
              >
                â—‰ Account
              </button>

              <button
                onClick={() =>
                  setTheme(
                    theme === "dark"
                      ? "light"
                      : "dark"
                  )
                }
              >
                â— Appearance{" "}
                <span>
                  {theme === "dark"
                    ? "Dark"
                    : "Light"}
                </span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {modal === "capture" && (
        <div
          className="modal-backdrop open"
          onMouseDown={(e) =>
            e.target ===
              e.currentTarget &&
            setModal(null)
          }
        >
          <section className="modal capture-modal">
            <button
              className="modal-close"
              onClick={() =>
                setModal(null)
              }
            >
              Ã—
            </button>

            <div className="modal-head">
              <span className="modal-icon gradient">
                +
              </span>

              <div>
                <h2>
                  Capture something
                </h2>

                <p>
                  Choose the fastest way
                  to add it to your vault.
                </p>
              </div>
            </div>

            <div className="capture-options">
              {([
                [
                  "note",
                  "âœŽ",
                  "Quick note",
                  "Write an idea or reminder",
                ],
                [
                  "link",
                  "â†—",
                  "Save link",
                  "URL, reel, post or article",
                ],
                [
                  "media",
                  "â—‰",
                  "Photo / video",
                  "Camera or media from device",
                ],
                [
                  "file",
                  "â–¡",
                  "Upload file",
                  "PDF, document or any file",
                ],
              ] as const).map(
                ([
                  type,
                  icon,
                  label,
                  desc,
                ]) => (
                  <button
                    className="capture-option"
                    key={type}
                    onClick={() =>
                      type ===
                        "media" ||
                      type === "file"
                        ? document
                            .getElementById(
                              "vault-file-input"
                            )
                            ?.click()
                        : createItem(
                            type
                          )
                    }
                  >
                    <span>{icon}</span>
                    <b>{label}</b>
                    <small>
                      {desc}
                    </small>
                  </button>
                )
              )}
            </div>

            <div className="capture-inputs">
              <label>
                ðŸ“· Take photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0];

                    if (file) {
                      void handleSelectedFile(
                        file
                      );
                    }

                    e.currentTarget.value =
                      "";
                  }}
                />
              </label>

              <label>
                ðŸŽ¥ Take video
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0];

                    if (file) {
                      void handleSelectedFile(
                        file
                      );
                    }

                    e.currentTarget.value =
                      "";
                  }}
                />
              </label>

              <label>
                ðŸ“ Choose any file
                <input
                  id="vault-file-input"
                  type="file"
                  accept="*/*"
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0];

                    if (file) {
                      void handleSelectedFile(
                        file
                      );
                    }

                    e.currentTarget.value =
                      "";
                  }}
                />
              </label>
            </div>
          </section>
        </div>
      )}

      {modal === "editor" &&
        editingId && (
          <div
            className="modal-backdrop open"
            onMouseDown={(e) =>
              e.target ===
                e.currentTarget &&
              setModal(null)
            }
          >
            <section className="modal editor-modal">
              <button
                className="modal-close"
                onClick={() =>
                  setModal(null)
                }
              >
                Ã—
              </button>

              <div className="modal-head">
                <span className="modal-icon">
                  {
                    typeIcon[
                      items.find(
                        (x) =>
                          x.id ===
                          editingId
                      )?.type ??
                        "note"
                    ]
                  }
                </span>

                <div>
                  <h2>
                    Edit item
                  </h2>

                  <p>
                    Changes are saved to
                    your Supabase vault.
                  </p>
                </div>
              </div>

              <form
                onSubmit={saveEdit}
              >
                <label>
                  Title
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        title:
                          e.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  Tags
                  <input
                    value={form.tags}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tags:
                          e.target.value,
                      })
                    }
                    placeholder="EV, Battery, Project"
                  />
                </label>

                {items.find(
                  (x) =>
                    x.id ===
                    editingId
                )?.type ===
                  "link" && (
                  <label>
                    URL
                    <input
                      type="url"
                      value={form.url}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          url:
                            e.target.value,
                        })
                      }
                      placeholder="https://..."
                    />
                  </label>
                )}

                <label>
                  Content / description
                  <textarea
                    rows={7}
                    value={form.content}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        content:
                          e.target.value,
                      })
                    }
                    placeholder="Write or paste content..."
                  />
                </label>

                <div className="editor-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setModal(null)
                    }
                  >
                    Cancel
                  </button>

                  <button
                    className="primary"
                    type="submit"
                    disabled={saving}
                  >
                    {saving
                      ? "Savingâ€¦"
                      : "Save changes"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

      {modal === "editor" &&
        !editingId && (
          <div
            className="modal-backdrop open"
            onMouseDown={(e) =>
              e.target ===
                e.currentTarget &&
              setModal(null)
            }
          >
            <section className="modal editor-modal">
              <button
                className="modal-close"
                onClick={() =>
                  setModal(null)
                }
              >
                Ã—
              </button>

              <div className="modal-head">
                <span className="modal-icon">
                  {form.url
                    ? "â†—"
                    : "âœŽ"}
                </span>

                <div>
                  <h2>
                    Save shared content
                  </h2>

                  <p>
                    Review the content
                    before saving it to
                    your vault.
                  </p>
                </div>
              </div>

              <form
                onSubmit={
                  saveSharedContent
                }
              >
                <label>
                  Title
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        title:
                          e.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  Tags
                  <input
                    value={form.tags}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tags:
                          e.target.value,
                      })
                    }
                    placeholder="Shared, YouTube, EV..."
                  />
                </label>

                {form.url && (
                  <label>
                    URL
                    <input
                      type="url"
                      value={form.url}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          url:
                            e.target.value,
                        })
                      }
                      placeholder="https://..."
                    />
                  </label>
                )}

                <label>
                  Content / description
                  <textarea
                    rows={7}
                    value={form.content}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        content:
                          e.target.value,
                      })
                    }
                    placeholder="Shared text..."
                  />
                </label>

                <div className="editor-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setModal(null)
                    }
                  >
                    Cancel
                  </button>

                  <button
                    className="primary"
                    type="submit"
                    disabled={saving}
                  >
                    {saving
                      ? "Savingâ€¦"
                      : "Save to My VaulT"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

      {modal === "viewer" &&
        viewerItem && (
          <div
            className="modal-backdrop open"
            onMouseDown={(e) =>
              e.target ===
                e.currentTarget &&
              setModal(null)
            }
          >
            <section className="modal viewer-modal">
              <button
                className="modal-close"
                onClick={() =>
                  setModal(null)
                }
              >
                Ã—
              </button>

              <div className="modal-head">
                <span className="modal-icon">
                  â—‰
                </span>

                <div>
                  <h2>
                    {viewerItem.title}
                  </h2>

                  <p>
                    {viewerItem.fileName ||
                      "Media preview"}
                  </p>
                </div>
              </div>

              <div className="media-viewer">
                {viewerItem.mediaUrl &&
                  isImage(
                    viewerItem
                  ) && (
                    <img
                      src={
                        viewerItem.mediaUrl
                      }
                      alt={
                        viewerItem.title
                      }
                    />
                  )}

                {viewerItem.mediaUrl &&
                  isVideo(
                    viewerItem
                  ) && (
                    <video
                      src={
                        viewerItem.mediaUrl
                      }
                      controls
                      playsInline
                    />
                  )}

                {viewerItem.mediaUrl &&
                  isAudio(
                    viewerItem
                  ) && (
                    <audio
                      src={
                        viewerItem.mediaUrl
                      }
                      controls
                    />
                  )}
              </div>

              <div className="editor-actions">
                <button
                  className="ghost"
                  onClick={() =>
                    setModal(null)
                  }
                >
                  Close
                </button>

                {viewerItem.mediaUrl && (
                  <button
                    className="primary"
                    onClick={() =>
                      window.open(
                        viewerItem.mediaUrl!,
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                  >
                    Open full size
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

      {modal === "settings" && (
        <div
          className="modal-backdrop open"
          onMouseDown={(e) =>
            e.target ===
              e.currentTarget &&
            setModal(null)
          }
        >
          <section className="modal settings-modal">
            <button
              className="modal-close"
              onClick={() =>
                setModal(null)
              }
            >
              Ã—
            </button>

            <div className="modal-head">
              <span className="modal-icon">
                âš™
              </span>

              <div>
                <h2>Settings</h2>

                <p>
                  Control the vault
                  experience.
                </p>
              </div>
            </div>

            <div className="settings-list">
              <button
                onClick={() =>
                  setTheme(
                    theme === "dark"
                      ? "light"
                      : "dark"
                  )
                }
              >
                <span>â—</span>

                <div>
                  <b>Appearance</b>
                  <small>
                    {theme === "dark"
                      ? "Dark mode"
                      : "Light mode"}
                  </small>
                </div>

                <strong>
                  Change
                </strong>
              </button>

              <button
                onClick={() =>
                  window.location.reload()
                }
              >
                <span>â†»</span>

                <div>
                  <b>
                    Refresh vault
                  </b>

                  <small>
                    Reload saved items
                    and collections
                  </small>
                </div>

                <strong>
                  Refresh
                </strong>
              </button>
            </div>
          </section>
        </div>
      )}

      {modal === "account" && (
        <div
          className="modal-backdrop open"
          onMouseDown={(e) =>
            e.target ===
              e.currentTarget &&
            setModal(null)
          }
        >
          <section className="modal settings-modal">
            <button
              className="modal-close"
              onClick={() =>
                setModal(null)
              }
            >
              Ã—
            </button>

            <div className="modal-head">
              <div className="avatar large">
                M
              </div>

              <div>
                <h2>Account</h2>
                <p>
                  {userEmail ||
                    "Signed in"}
                </p>
              </div>
            </div>

            <div className="settings-list">
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.reload();
                }}
              >
                <span>â†ª</span>

                <div>
                  <b>Sign out</b>
                  <small>
                    End this session on
                    this device
                  </small>
                </div>

                <strong>
                  Sign out
                </strong>
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast show">
          {toast}
        </div>
      )}
    </div>
  );
}