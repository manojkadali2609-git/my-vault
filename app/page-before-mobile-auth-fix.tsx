"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ItemType = "note" | "link" | "media" | "file";
type Item = {
  id: string;
  user_id: string;
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

const typeLabel: Record<ItemType, string> = { note: "Note", link: "Link", media: "Media", file: "File" };
const typeIcon: Record<ItemType, string> = { note: "✎", link: "↗", media: "◉", file: "□" };
const BUCKET = "vault files";
const supabase = createClient();

function dbToItem(row: any): Item {
  return {
    id: String(row.id), user_id: String(row.user_id), type: row.type, title: row.title ?? "Untitled",
    content: row.content ?? "", url: row.url ?? null, fileName: row.file_name ?? row.fileName ?? null,
    file_path: row.file_path ?? null, mime_type: row.mime_type ?? null, file_size: row.file_size ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [], favorite: Boolean(row.favorite), collection: row.collection ?? null,
    created_at: row.created_at, updated_at: row.updated_at, deleted_at: row.deleted_at ?? null,
    date: row.created_at ? new Date(row.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Today",
  };
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function isImage(item: Item) { return !!item.mime_type?.startsWith("image/"); }
function isVideo(item: Item) { return !!item.mime_type?.startsWith("video/"); }
function isAudio(item: Item) { return !!item.mime_type?.startsWith("audio/"); }

function TrashBin({ notify, userId, onRestored }: { notify: (m: string) => void; userId: string; onRestored: (item: Item) => void }) {
  const [deleted, setDeleted] = useState<Item[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(true);
  useEffect(() => {
    (async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.from("items").select("*").eq("user_id", userId).not("deleted_at", "is", null).gte("deleted_at", cutoff).order("deleted_at", { ascending: false });
      if (error) notify(`Could not load Recycle Bin: ${error.message}`); else setDeleted((data ?? []).map(dbToItem));
      setLoadingTrash(false);
    })();
  }, [notify, userId]);
  async function restore(id: string) {
    const { data, error } = await supabase.from("items").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).select("*").single();
    if (error) { notify(`Could not restore: ${error.message}`); return; }
    const restored = dbToItem(data); setDeleted(d => d.filter(x => x.id !== id)); onRestored(restored); notify("Item restored");
  }
  async function purge(id: string) {
    if (!window.confirm("Permanently delete this item? This cannot be undone.")) return;
    const item = deleted.find(x => x.id === id);
    if (item?.file_path) await supabase.storage.from(BUCKET).remove([item.file_path]);
    const { error } = await supabase.from("items").delete().eq("id", id).eq("user_id", userId);
    if (error) { notify(`Could not permanently delete: ${error.message}`); return; }
    setDeleted(d => d.filter(x => x.id !== id)); notify("Permanently deleted");
  }
  if (loadingTrash) return <div className="empty"><div>◌</div><h3>Loading Recycle Bin…</h3><p>Checking deleted items from the last 30 days.</p></div>;
  if (!deleted.length) return <div className="empty"><div>♻</div><h3>Recycle Bin is empty</h3><p>Deleted items remain restorable for 30 days.</p></div>;
  return <div className="cards">{deleted.map(x => <article className="card" key={x.id}><div className="card-top"><span className="type-badge">{typeIcon[x.type]} {typeLabel[x.type]}</span></div><div className="card-body"><h3>{x.title}</h3><p>{x.content}</p><div className="card-foot"><span>Deleted {x.deleted_at ? new Date(x.deleted_at).toLocaleDateString() : ""}</span><div className="card-actions"><button title="Restore" onClick={() => restore(x.id)}>↶</button><button title="Permanently delete" className="danger-action" onClick={() => purge(x.id)}>⌫</button></div></div></div></article>)}</div>;
}

export default function Page() {
  const [items, setItems] = useState<Item[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [view, setView] = useState("all");
  const [filter, setFilter] = useState("all");
  const [tag, setTag] = useState("all");
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [modal, setModal] = useState<"capture" | "editor" | "viewer" | "settings" | "account" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewerItem, setViewerItem] = useState<Item | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [form, setForm] = useState({ title: "", tags: "", url: "", content: "" });

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2600); }

  async function addSignedUrls(rows: Item[]) {
    const paths = rows.map(x => x.file_path).filter(Boolean) as string[];
    if (!paths.length) return rows;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    const map = new Map<string, string>();
    (data ?? []).forEach((entry: any, i: number) => { if (entry?.signedUrl) map.set(paths[i], entry.signedUrl); });
    return rows.map(x => ({ ...x, mediaUrl: x.file_path ? map.get(x.file_path) ?? null : null }));
  }

  async function loadVault(showSpinner = true) {
    if (showSpinner) setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setUserId(""); setUserEmail(""); setItems([]); setCollections([]); setLoading(false); notify("Please sign in to use your vault."); return; }
    setUserId(auth.user.id); setUserEmail(auth.user.email ?? "");
    const [{ data, error }, { data: collectionRows, error: collectionError }] = await Promise.all([
      supabase.from("items").select("*").eq("user_id", auth.user.id).is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("collections").select("name").eq("user_id", auth.user.id).order("created_at", { ascending: true }),
    ]);
    if (error) notify(`Could not load vault: ${error.message}`);
    else setItems(await addSignedUrls((data ?? []).map(dbToItem)));
    if (collectionError) notify(`Collections need database setup: ${collectionError.message}`);
    else setCollections((collectionRows ?? []).map((row: { name: string }) => row.name));
    setLoading(false);
  }

  useEffect(() => { void loadVault(); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const viewToType: Record<string, ItemType | undefined> = { notes: "note", links: "link", media: "media", files: "file" };
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase(); if (!q) return [] as Item[];
    return items.filter(x => [x.title, x.fileName ?? "", x.content, x.url ?? ""].join(" ").toLowerCase().includes(q)).slice(0, 5);
  }, [items, search]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = items.filter(x => {
      const requestedType = viewToType[view];
      const viewOK = view === "all" || (view === "favorites" ? x.favorite : requestedType ? x.type === requestedType : true);
      const filterOK = filter === "all" || (filter === "favorites" ? x.favorite : true);
      const tagOK = tag === "all" || x.tags.includes(tag);
      const collectionOK = !activeCollection || x.collection === activeCollection;
      const haystack = [x.title, x.content, x.url ?? "", x.type, x.fileName ?? "", ...x.tags].join(" ").toLowerCase();
      return viewOK && filterOK && tagOK && collectionOK && (!q || haystack.includes(q));
    });
    if (filter === "recent") result = result.slice(0, 6);
    return result;
  }, [items, view, filter, tag, search, activeCollection]);

  function openEditor(item: Item) { setEditingId(item.id); setForm({ title: item.title, tags: item.tags.join(", "), url: item.url ?? "", content: item.content }); setModal("editor"); }

  async function createItem(type: ItemType, selectedFile?: File) {
    if (!userId) { notify("Please sign in first"); return; }
    setSaving(true);
    let filePath: string | null = null, fileName: string | null = null, mimeType: string | null = null, fileSize: number | null = null;
    let actualType = type;
    if (selectedFile) {
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      filePath = `${userId}/${crypto.randomUUID()}-${safeName}`; fileName = selectedFile.name; mimeType = selectedFile.type || "application/octet-stream"; fileSize = selectedFile.size;
      actualType = mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/") ? "media" : "file";
      const { error } = await supabase.storage.from(BUCKET).upload(filePath, selectedFile, { contentType: mimeType, upsert: false });
      if (error) { setSaving(false); notify(`Upload failed: ${error.message}`); return; }
    }
    const payload: any = { user_id: userId, type: actualType, title: selectedFile?.name ?? `New ${typeLabel[actualType]}`, content: selectedFile ? `Uploaded file: ${selectedFile.name}` : "Start adding your content here.", tags: ["New"], favorite: false, collection: activeCollection, ...(actualType === "link" ? { url: "https://" } : {}), ...(selectedFile ? { file_path: filePath, file_name: fileName, mime_type: mimeType, file_size: fileSize } : {}) };
    const { data, error } = await supabase.from("items").insert(payload).select("*").single();
    if (error) { if (filePath) await supabase.storage.from(BUCKET).remove([filePath]); setSaving(false); notify(`Could not save: ${error.message}`); return; }
    const [item] = await addSignedUrls([dbToItem(data)]);
    setItems(current => [item, ...current]); setSaving(false); setModal(null); setView("all"); setFilter("all"); setTag("all");
    if (selectedFile) { notify(`${selectedFile.name} uploaded successfully`); return; }
    openEditor(item);
  }

  async function handleSelectedFile(file: File) { await createItem("file", file); }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editingId || !userId) return; setSaving(true);
    const current = items.find(x => x.id === editingId);
    const updates: any = { title: form.title.trim() || "Untitled", tags: form.tags.split(",").map(s => s.trim()).filter(Boolean), content: form.content.trim(), updated_at: new Date().toISOString() };
    if (current?.type === "link") updates.url = form.url.trim();
    const { data, error } = await supabase.from("items").update(updates).eq("id", editingId).eq("user_id", userId).select("*").single();
    setSaving(false); if (error) { notify(`Could not save: ${error.message}`); return; }
    const [updated] = await addSignedUrls([dbToItem(data)]); setItems(currentItems => currentItems.map(x => x.id === editingId ? updated : x)); setModal(null); notify("Saved to your vault");
  }

  async function toggleFavorite(id: string) {
    const item = items.find(x => x.id === id); if (!item || !userId) return;
    const { data, error } = await supabase.from("items").update({ favorite: !item.favorite, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).select("*").single();
    if (error) { notify(`Could not update favorite: ${error.message}`); return; }
    const [updated] = await addSignedUrls([dbToItem(data)]); setItems(current => current.map(x => x.id === id ? updated : x));
  }

  async function deleteItem(id: string) {
    if (!userId || !window.confirm("Move this item to Recycle Bin? It can be restored for 30 days.")) return;
    const now = new Date().toISOString(); const { error } = await supabase.from("items").update({ deleted_at: now, updated_at: now }).eq("id", id).eq("user_id", userId);
    if (error) { notify(`Could not move to Recycle Bin: ${error.message}`); return; }
    setItems(current => current.filter(x => x.id !== id)); notify("Moved to Recycle Bin");
  }

  async function moveToCollection(id: string, collection: string | null) {
    if (!userId) return; const clean = collection?.trim() || null;
    const { data, error } = await supabase.from("items").update({ collection: clean, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).select("*").single();
    if (error) { notify(`Could not move item: ${error.message}`); return; }
    const [updated] = await addSignedUrls([dbToItem(data)]); setItems(current => current.map(x => x.id === id ? updated : x)); if (clean) notify(`Moved to ${clean}`);
  }

  async function createCollection() {
    if (!userId) return;
    const name = window.prompt("Collection name"); if (!name?.trim()) return; const clean = name.trim();
    if (collections.some(c => c.toLowerCase() === clean.toLowerCase())) { setActiveCollection(collections.find(c => c.toLowerCase() === clean.toLowerCase())!); notify("That collection already exists"); return; }
    const { error } = await supabase.from("collections").insert({ user_id: userId, name: clean });
    if (error) { notify(`Could not save collection: ${error.message}`); return; }
    setCollections(current => [...current, clean]); setActiveCollection(clean); notify(`Collection “${clean}” created`);
  }

  async function renameCollection(oldName: string) {
    if (!userId) return; const next = window.prompt("Rename collection", oldName)?.trim(); if (!next || next === oldName) return;
    const { error } = await supabase.from("collections").update({ name: next }).eq("user_id", userId).eq("name", oldName);
    if (error) { notify(`Could not rename collection: ${error.message}`); return; }
    await supabase.from("items").update({ collection: next }).eq("user_id", userId).eq("collection", oldName);
    setCollections(c => c.map(x => x === oldName ? next : x)); setItems(i => i.map(x => x.collection === oldName ? { ...x, collection: next } : x)); if (activeCollection === oldName) setActiveCollection(next); notify("Collection renamed");
  }

  async function deleteCollection(name: string) {
    if (!userId || !window.confirm(`Delete collection “${name}”? Items will stay in your vault.`)) return;
    const { error } = await supabase.from("collections").delete().eq("user_id", userId).eq("name", name);
    if (error) { notify(`Could not delete collection: ${error.message}`); return; }
    await supabase.from("items").update({ collection: null }).eq("user_id", userId).eq("collection", name);
    setCollections(c => c.filter(x => x !== name)); setItems(i => i.map(x => x.collection === name ? { ...x, collection: null } : x)); if (activeCollection === name) setActiveCollection(null); notify("Collection deleted");
  }

  function openItem(item: Item) {
    if (item.type === "media" && item.mediaUrl) { setViewerItem(item); setModal("viewer"); return; }
    if (item.type === "file" && item.mediaUrl) { if (window.confirm(`Open “${item.fileName ?? item.title}” in a new tab?`)) window.open(item.mediaUrl, "_blank", "noopener,noreferrer"); return; }
    if (item.url && item.url !== "https://") { if (window.confirm(`Open this link in a new tab?\n\n${item.url}`)) window.open(item.url, "_blank", "noopener,noreferrer"); return; }
    openEditor(item);
  }

  const title = search ? `Results for “${search}”` : ({ all: "Everything worth keeping.", notes: "Your notes, organized.", links: "Links worth returning to.", media: "Your saved media.", files: "Files in your vault.", favorites: "Your saved favorites.", trash: "Recently deleted items." } as Record<string, string>)[view] ?? "Everything worth keeping.";
  const setViewAndReset = (next: string) => { setView(next); setFilter("all"); setTag("all"); setActiveCollection(null); };
  const contextualCaptureLabel = view === "notes" ? "＋ Add note" : view === "links" ? "＋ Add URL" : view === "media" ? "＋ Add media" : view === "files" ? "＋ Upload file" : view === "trash" ? "Recycle Bin" : activeCollection ? `＋ Add to ${activeCollection}` : "＋ Capture";

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setViewAndReset("all")} aria-label="Go home"><div className="brand-mark"><span /><i /></div><div><strong>My VaulT</strong><small>Personal reference vault</small></div></button>
      <button className="capture-btn" onClick={() => setModal("capture")} disabled={saving}><span className="plus">+</span><span>Capture</span><kbd>C</kbd></button>
      <nav className="nav">{[["all","⌂","All items",items.length],["notes","▤","Notes",items.filter(x=>x.type==="note").length],["links","↗","Links",items.filter(x=>x.type==="link").length],["media","◉","Media",items.filter(x=>x.type==="media").length],["files","□","Files",items.filter(x=>x.type==="file").length],["favorites","★","Favorites",items.filter(x=>x.favorite).length],["trash","♻","Recycle Bin",""]].map(([key,icon,label,count]) => <button key={String(key)} className={`nav-item ${view===key?"active":""}`} onClick={() => setViewAndReset(String(key))}><span>{icon}</span><b>{label}</b><em>{count}</em></button>)}</nav>
      <div className="sidebar-section"><div className="section-label">Collections</div>{collections.length===0 && <div className="collection-empty">Create a collection, then drag a card here.</div>}{collections.map(x => <div className={`collection ${activeCollection===x?"active":""}`} key={x} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move"}} onDrop={async e=>{e.preventDefault();const id=e.dataTransfer.getData("text/my-vault-item");if(id) await moveToCollection(id,x);}}><button className="collection-main" onClick={()=>setActiveCollection(activeCollection===x?null:x)}><i />{x}</button><button className="collection-more" title="Rename" onClick={()=>void renameCollection(x)}>✎</button><button className="collection-more danger-action" title="Delete collection" onClick={()=>void deleteCollection(x)}>×</button></div>)}<button className="new-collection" onClick={()=>void createCollection()}>＋ New collection</button></div>
      <div className="sidebar-bottom"><button className="mini-nav" onClick={()=>setTheme(theme==="dark"?"light":"dark")}><span>◐</span> Appearance <small>{theme==="dark"?"Dark":"Light"}</small></button><button className="mini-nav" onClick={()=>setModal("settings")}><span>⚙</span> Settings</button><button className="account" onClick={()=>setModal("account")}><div className="avatar">M</div><div><b>Manoj</b><small>{userEmail || "Signed in"}</small></div><span>•••</span></button></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-brand" onClick={()=>setViewAndReset("all")}><div className="brand-mark"><span /><i /></div><strong>My VaulT</strong></button><div className="breadcrumbs"><span>Vault</span><i>/</i><b>{view === "all" ? "All items" : view[0].toUpperCase()+view.slice(1)}</b></div><div className="top-actions"><button className="icon-btn" onClick={()=>document.getElementById("vault-search")?.focus()}>⌕</button><button className="icon-btn" onClick={()=>setModal("settings")}>⚙</button><button className="profile" onClick={()=>setModal("account")}>M</button></div></header>
      <section className="content"><div className="section-capture-row"><button className="context-capture-btn" onClick={()=>setModal("capture")} disabled={saving || view === "trash"}>{contextualCaptureLabel}</button><span>Save something new without leaving this section.</span></div><div className="hero"><div><div className="eyebrow"><span className="live-dot" /> {loading ? "Loading your vault" : "Your vault is ready"}</div><h1>{title}</h1><p>Capture ideas, links, files and media. Find them instantly when you need them.</p></div><div className="hero-stat"><strong>{items.length}</strong><span>saved items</span></div></div>
        <div className="toolbar"><div className="search-wrap"><span>⌕</span><input id="vault-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your vault..." autoComplete="off"/><kbd>⌘ K</kbd>{suggestions.length>0&&<div className="search-suggestions">{suggestions.map(s=><button key={s.id} onClick={()=>{setSearch(s.title);setView("all");}}><span>{typeIcon[s.type]}</span><div><b>{s.title}</b><small>{s.fileName || s.type}</small></div></button>)}</div>}</div><div className="toolbar-actions">{["all","recent","favorites"].map(x=><button key={x} className={`filter-btn ${filter===x?"active":""}`} onClick={()=>setFilter(x)}>{x==="favorites"?"★":x[0].toUpperCase()+x.slice(1)}</button>)}<button className={`view-btn ${layout==="grid"?"active":""}`} onClick={()=>setLayout("grid")}>▦</button><button className={`view-btn ${layout==="list"?"active":""}`} onClick={()=>setLayout("list")}>☷</button></div></div>
        <div className="chip-row">{["all","EV","Battery","Engineering","Project"].map(x=><button key={x} className={`chip ${tag===x?"active":""}`} onClick={()=>setTag(x)}>{x==="all"?"All":x}</button>)}</div><div className="result-meta"><span>{activeCollection?`Collection: ${activeCollection} · `:""}{filtered.length} {filtered.length===1?"item":"items"}</span><button onClick={()=>setSearch("")}>Clear search</button></div>
        {loading ? <div className="empty"><div>◌</div><h3>Loading your vault…</h3><p>Fetching your saved items securely.</p></div> : view === "trash" ? <TrashBin notify={notify} userId={userId} onRestored={restored=>{setItems(current=>[restored,...current]);setView("all");setActiveCollection(restored.collection ?? null);}} /> : filtered.length===0 ? <div className="empty"><div>⌕</div><h3>{search?"No matching items":"Your vault is empty"}</h3><p>{search?"Try another keyword, tag, or content type.":"Use Capture to add your first item."}</p></div> : <div className={`cards ${layout==="list"?"list":""}`}>{filtered.map(x=><article className="card" key={x.id} draggable onDragStart={e=>{e.dataTransfer.setData("text/my-vault-item",x.id);e.dataTransfer.effectAllowed="move"}}><div className={`card-top ${x.mediaUrl?"has-media":""}`}>{x.mediaUrl&&isImage(x)&&<img src={x.mediaUrl} alt="" loading="lazy"/>}{x.mediaUrl&&isVideo(x)&&<video src={x.mediaUrl} muted playsInline preload="metadata"/>}<span className="type-badge">{typeIcon[x.type]} {typeLabel[x.type]}</span><button className={`favorite ${x.favorite?"on":""}`} onClick={()=>void toggleFavorite(x.id)}>{x.favorite?"★":"☆"}</button></div><div className="card-body"><h3>{x.title}</h3><p>{x.fileName ? `${x.fileName}${x.file_size ? ` · ${formatBytes(x.file_size)}` : ""}` : x.content}</p><div className="tags">{x.tags.map(t=><span className="tag" key={t}>{t}</span>)}</div><div className="card-foot"><span>{x.date}</span><div className="card-actions"><button title="Edit" onClick={()=>openEditor(x)}>✎</button><button title="Open" onClick={()=>openItem(x)}>↗</button>{collections.length>0&&<select className="collection-select" value={x.collection??""} onChange={e=>void moveToCollection(x.id,e.target.value||null)} title="Move to collection"><option value="">Move…</option>{collections.map(c=><option key={c} value={c}>{c}</option>)}</select>}<button title="Delete" className="danger-action" onClick={()=>void deleteItem(x.id)}>⌫</button></div></div></div></article>)}</div>}
      </section>
    </main>
    <nav className="mobile-nav"><button className={`mobile-nav-item ${view==="all"?"active":""}`} onClick={()=>setViewAndReset("all")}><span>⌂</span><small>Home</small></button><button className={`mobile-nav-item ${view==="notes"?"active":""}`} onClick={()=>setViewAndReset("notes")}><span>▤</span><small>Notes</small></button><button className="mobile-capture" onClick={()=>setModal("capture")}><span>+</span></button><button className={`mobile-nav-item ${view==="favorites"?"active":""}`} onClick={()=>setViewAndReset("favorites")}><span>★</span><small>Saved</small></button><button className="mobile-nav-item" onClick={()=>setModal("settings")}><span>⚙</span><small>More</small></button></nav>
    {modal==="capture"&&<div className="modal-backdrop open" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><section className="modal capture-modal"><button className="modal-close" onClick={()=>setModal(null)}>×</button><div className="modal-head"><span className="modal-icon gradient">+</span><div><h2>Capture something</h2><p>Save it directly into your cloud vault.</p></div></div><div className="capture-options">{([ ["note","✎","Quick note","Write an idea or reminder"],["link","↗","Save link","URL, reel, post or article"],["media","◉","Photo / video","Choose media from device"],["file","□","Upload file","PDF, document or any file"]] as const).map(([type,icon,label,desc])=><button className="capture-option" key={type} onClick={()=>type === "media" || type === "file" ? document.getElementById("vault-file-input")?.click() : void createItem(type)}><span>{icon}</span><b>{label}</b><small>{desc}</small></button>)}</div><div className="capture-inputs"><label>📷 Take photo<input type="file" accept="image/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(file)void handleSelectedFile(file);e.currentTarget.value=""}}/></label><label>🎥 Take video<input type="file" accept="video/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(file)void handleSelectedFile(file);e.currentTarget.value=""}}/></label><label>📁 Choose any file<input id="vault-file-input" type="file" accept="*/*" onChange={e=>{const file=e.target.files?.[0];if(file)void handleSelectedFile(file);e.currentTarget.value=""}}/></label></div></section></div>}
    {modal==="editor"&&editingId&&<div className="modal-backdrop open" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><section className="modal editor-modal"><button className="modal-close" onClick={()=>setModal(null)}>×</button><div className="modal-head"><span className="modal-icon">{typeIcon[items.find(x=>x.id===editingId)?.type??"note"]}</span><div><h2>Edit item</h2><p>Changes are saved to your Supabase vault.</p></div></div><form onSubmit={saveEdit}><label>Title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required/></label><label>Tags<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="EV, Battery, Project"/></label>{items.find(x=>x.id===editingId)?.type==="link"&&<label>URL<input type="url" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} placeholder="https://..."/></label>}<label>Content / description<textarea rows={7} value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder="Write or paste content..."/></label><div className="editor-actions"><button type="button" className="ghost" onClick={()=>setModal(null)}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving?"Saving…":"Save changes"}</button></div></form></section></div>}
    {modal==="viewer"&&viewerItem&&<div className="modal-backdrop open" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><section className="modal viewer-modal"><button className="modal-close" onClick={()=>setModal(null)}>×</button><div className="modal-head"><span className="modal-icon">◉</span><div><h2>{viewerItem.title}</h2><p>{viewerItem.fileName || "Media preview"}</p></div></div><div className="media-viewer">{viewerItem.mediaUrl&&isImage(viewerItem)&&<img src={viewerItem.mediaUrl} alt={viewerItem.title}/>} {viewerItem.mediaUrl&&isVideo(viewerItem)&&<video src={viewerItem.mediaUrl} controls autoPlay playsInline/>} {viewerItem.mediaUrl&&isAudio(viewerItem)&&<audio src={viewerItem.mediaUrl} controls/>}</div><div className="editor-actions"><button className="ghost" onClick={()=>setModal(null)}>Close</button>{viewerItem.mediaUrl&&<button className="primary" onClick={()=>window.open(viewerItem.mediaUrl!,"_blank","noopener,noreferrer")}>Open full size</button>}</div></section></div>}
    {modal==="settings"&&<div className="modal-backdrop open" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><section className="modal settings-modal"><button className="modal-close" onClick={()=>setModal(null)}>×</button><div className="modal-head"><span className="modal-icon">⚙</span><div><h2>Settings</h2><p>Control the vault experience on this device.</p></div></div><div className="settings-list"><button onClick={()=>setTheme(theme==="dark"?"light":"dark")}><span>◐</span><div><b>Appearance</b><small>{theme==="dark"?"Dark mode":"Light mode"}</small></div><strong>Change</strong></button><button onClick={()=>void loadVault()}><span>↻</span><div><b>Refresh vault</b><small>Reload collections and saved items from Supabase</small></div><strong>Refresh</strong></button></div></section></div>}
    {modal==="account"&&<div className="modal-backdrop open" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><section className="modal settings-modal"><button className="modal-close" onClick={()=>setModal(null)}>×</button><div className="modal-head"><div className="avatar large">M</div><div><h2>Account</h2><p>{userEmail || "Signed in"}</p></div></div><div className="settings-list"><button onClick={async()=>{await supabase.auth.signOut();window.location.reload();}}><span>↪</span><div><b>Sign out</b><small>End this session on this device</small></div><strong>Sign out</strong></button></div></section></div>}
    {toast&&<div className="toast show">{toast}</div>}
  </div>;
}
