"use client";

import { useEffect, useMemo, useState } from "react";
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

const supabase = createClient();

function dbToItem(row: any): Item {
  return {
    id: String(row.id), user_id: row.user_id, type: row.type, title: row.title ?? "Untitled",
    content: row.content ?? "", url: row.url ?? null, fileName: row.file_name ?? row.fileName ?? null,
    file_path: row.file_path ?? null, mime_type: row.mime_type ?? null, file_size: row.file_size ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [], favorite: Boolean(row.favorite),
    collection: row.collection ?? null, created_at: row.created_at, updated_at: row.updated_at, deleted_at: row.deleted_at ?? null,
    date: row.created_at ? new Date(row.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Today",
  };
}

function TrashBin({ notify, onRestored }: { notify: (m: string) => void; onRestored: (item: Item) => void }) {
  const [deleted, setDeleted] = useState<Item[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(true);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("items").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
      if (error) notify(`Could not load Recycle Bin: ${error.message}`); else setDeleted((data ?? []).map(dbToItem));
      setLoadingTrash(false);
    })();
  }, []);
  async function restore(id:string) {
    const { data, error } = await supabase.from("items").update({ deleted_at:null, updated_at:new Date().toISOString() }).eq("id",id).select("*").single();
    if(error){notify(`Could not restore: ${error.message}`);return;}
    const restored = dbToItem(data);
    setDeleted(d=>d.filter(x=>x.id!==id));
    onRestored(restored);
    notify("Item restored");
  }
  async function purge(id:string) {
    if(!window.confirm("Permanently delete this item? This cannot be undone.")) return;
    const { error } = await supabase.from("items").delete().eq("id",id);
    if(error){notify(`Could not permanently delete: ${error.message}`);return;} setDeleted(d=>d.filter(x=>x.id!==id)); notify("Permanently deleted");
  }
  if(loadingTrash) return <div className="empty"><div>◌</div><h3>Loading Recycle Bin…</h3><p>Checking deleted items.</p></div>;
  if(!deleted.length) return <div className="empty"><div>♻</div><h3>Recycle Bin is empty</h3><p>Deleted items can be restored for 30 days.</p></div>;
  return <div className="cards">{deleted.map(x=><article className="card" key={x.id}><div className="card-top"><span className="type-badge">{typeIcon[x.type]} {typeLabel[x.type]}</span></div><div className="card-body"><h3>{x.title}</h3><p>{x.content}</p><div className="card-foot"><span>Deleted {x.deleted_at?new Date(x.deleted_at).toLocaleDateString():""}</span><div className="card-actions"><button title="Restore" onClick={()=>restore(x.id)}>↶</button><button title="Permanently delete" className="danger-action" onClick={()=>purge(x.id)}>⌫</button></div></div></div></article>)}</div>;
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
  const [modal, setModal] = useState<"capture" | "editor" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [form, setForm] = useState({ title: "", tags: "", url: "", content: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const [{ data, error }, { data: collectionRows, error: collectionError }] = await Promise.all([
        supabase.from("items").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        auth.user
          ? supabase.from("collections").select("name").eq("user_id", auth.user.id).order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!active) return;
      if (auth.user) setUserEmail(auth.user.email ?? "");
      if (error) notify(`Could not load vault: ${error.message}`);
      else setItems((data ?? []).map(dbToItem));
      if (!collectionError && collectionRows) {
        setCollections(collectionRows.map((row: { name: string }) => row.name));
      } else {
        const savedCollections = window.localStorage.getItem("myvault-collections");
        if (savedCollections) {
          try { setCollections(JSON.parse(savedCollections)); } catch {}
        }
      }
      const savedTheme = window.localStorage.getItem("myvault-theme") as "dark" | "light" | null;
      if (savedTheme) setTheme(savedTheme);
      setLoading(false);
    }
    load();
  return () => { active = false; };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("myvault-collections", JSON.stringify(collections));
  }, [collections]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("myvault-theme", theme);
  }, [theme]);

  const viewToType: Record<string, ItemType | undefined> = { notes: "note", links: "link", media: "media", files: "file" };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = items.filter((x) => {
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

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function openEditor(item: Item) {
    setEditingId(item.id);
    setForm({ title: item.title, tags: item.tags.join(", "), url: item.url ?? "", content: item.content });
    setModal("editor");
  }

  async function createItem(type: ItemType, selectedFile?: File) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { notify("Please sign in first"); return; }
    setSaving(true);

    let filePath: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;
    let actualType = type;

    if (selectedFile) {
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      filePath = `${auth.user.id}/${crypto.randomUUID()}-${safeName}`;
      fileName = selectedFile.name;
      mimeType = selectedFile.type || "application/octet-stream";
      fileSize = selectedFile.size;
      actualType = mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/") ? "media" : "file";

      const { error: uploadError } = await supabase.storage.from("vault files").upload(filePath, selectedFile, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) {
        setSaving(false);
        notify(`Upload failed: ${uploadError.message}`);
        return;
      }
    }

    const payload: any = {
      user_id: auth.user.id, type: actualType, title: selectedFile?.name ?? `New ${typeLabel[actualType]}`,
      content: selectedFile ? `Uploaded file: ${selectedFile.name}` : "Start adding your content here.",
      tags: ["New"], favorite: false, collection: activeCollection,
      ...(actualType === "link" ? { url: "https://" } : {}),
      ...(selectedFile ? { file_path: filePath, file_name: fileName, mime_type: mimeType, file_size: fileSize } : {}),
    };
    const { data, error } = await supabase.from("items").insert(payload).select("*").single();
    setSaving(false);
    if (error) {
      if (filePath) await supabase.storage.from("vault files").remove([filePath]);
      notify(`Could not save: ${error.message}`);
      return;
    }
    const item = dbToItem(data);
    setItems((current) => [item, ...current]);
    setModal(null); setView("all"); setFilter("all"); setTag("all");
    if (selectedFile) {
      notify(`${selectedFile.name} uploaded successfully`);
      return;
    }
    setEditingId(item.id);
    setForm({ title: item.title, tags: item.tags.join(", "), url: item.url ?? "", content: item.content });
    setModal("editor");
  }

  async function handleSelectedFile(file: File) {
    await createItem("file", file);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    const current = items.find((x) => x.id === editingId);
    const updates: any = {
      title: form.title.trim() || "Untitled", tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      content: form.content.trim(), updated_at: new Date().toISOString(),
    };
    if (current?.type === "link") updates.url = form.url.trim();
    const { data, error } = await supabase.from("items").update(updates).eq("id", editingId).select("*").single();
    setSaving(false);
    if (error) { notify(`Could not save: ${error.message}`); return; }
    setItems((currentItems) => currentItems.map((x) => x.id === editingId ? dbToItem(data) : x));
    setModal(null); notify("Saved to your vault");
  }

  async function toggleFavorite(id: string) {
    const item = items.find((x) => x.id === id); if (!item) return;
    const { data, error } = await supabase.from("items").update({ favorite: !item.favorite, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) { notify(`Could not update favorite: ${error.message}`); return; }
    setItems((current) => current.map((x) => x.id === id ? dbToItem(data) : x));
  }

  async function deleteItem(id: string) {
    if (!window.confirm("Move this item to Recycle Bin? It can be restored for 30 days.")) return;
    const deletedAt = new Date().toISOString();
    const { error } = await supabase.from("items").update({ deleted_at: deletedAt, updated_at: deletedAt }).eq("id", id);
    if (error) { notify(`Could not move to Recycle Bin: ${error.message}`); return; }
    setItems((current) => current.filter((x) => x.id !== id)); notify("Moved to Recycle Bin");
  }

  async function moveToCollection(id: string, collection: string) {
    const clean = collection.trim(); if (!clean) return;
    const { data, error } = await supabase.from("items").update({ collection: clean, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) { notify(`Could not move item: ${error.message}`); return; }
    setItems((current) => current.map((x) => x.id === id ? dbToItem(data) : x)); notify(`Moved to ${clean}`);
  }

  function handleCollectionDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  async function handleCollectionDrop(e: React.DragEvent, collection: string) {
    e.preventDefault(); const id = e.dataTransfer.getData("text/my-vault-item") || e.dataTransfer.getData("text/plain"); if (id) await moveToCollection(id, collection); else notify("Drag a card from the vault onto a collection.");
  }

  async function createCollection() {
    const name = window.prompt("Collection name");
    if (!name?.trim()) return;
    const clean = name.trim();
    if (collections.some(c => c.toLowerCase() === clean.toLowerCase())) {
      const existing = collections.find(c => c.toLowerCase() === clean.toLowerCase())!;
      setActiveCollection(existing);
      notify("That collection already exists");
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { notify("Please sign in again."); return; }
    const { error } = await supabase.from("collections").insert({ user_id: auth.user.id, name: clean });
    if (error) { notify(`Could not save collection: ${error.message}`); return; }
    setCollections(current => [...current, clean]);
    setActiveCollection(clean);
    notify(`Collection "${clean}" created — you can drag cards here or use Move…`);
  }

  function openItem(item: Item) {
    if (item.url && item.url !== "https://") {
      if (!window.confirm(`Open this link in a new tab?\n\n${item.url}`)) return;
      window.open(item.url, "_blank", "noopener,noreferrer");
    } else openEditor(item);
  }

  const title = search ? `Results for “${search}”` : ({ all: "Everything worth keeping.", notes: "Your notes, organized.", links: "Links worth returning to.", media: "Your saved media.", files: "Files in your vault.", favorites: "Your saved favorites.", trash: "Recently deleted items." } as Record<string, string>)[view] ?? "Everything worth keeping.";
  const setViewAndReset = (next: string) => { setView(next); setFilter("all"); setTag("all"); setActiveCollection(null); };

  const contextualCaptureLabel = view === "notes" ? "＋ Add note" : view === "links" ? "＋ Add URL" : view === "media" ? "＋ Add media" : view === "files" ? "＋ Upload file" : view === "favorites" ? "＋ Capture favorite" : view === "trash" ? "Recycle Bin" : activeCollection ? `＋ Add to ${activeCollection}` : "＋ Capture";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setViewAndReset("all")} aria-label="Go home"><div className="brand-mark"><span /><i /></div><div><strong>My VaulT</strong><small>Personal knowledge vault</small></div></button>
        <button className="capture-btn" onClick={() => setModal("capture")} disabled={saving}><span className="plus">+</span><span>Capture</span><kbd>C</kbd></button>
        <nav className="nav">{[["all","⌂","All items",items.length],["notes","▤","Notes",items.filter(x=>x.type==="note").length],["links","↗","Links",items.filter(x=>x.type==="link").length],["media","◉","Media",items.filter(x=>x.type==="media").length],["files","□","Files",items.filter(x=>x.type==="file").length],["favorites","★","Favorites",items.filter(x=>x.favorite).length],["trash","♻","Recycle Bin",""]].map(([key,icon,label,count])=><button key={String(key)} className={`nav-item ${view===key?"active":""}`} onClick={()=>setViewAndReset(String(key))}><span>{icon}</span><b>{label}</b><em>{count}</em></button>)}</nav>
        <div className="sidebar-section">
<div className="section-label">Collections</div>
{collections.length===0 && <div className="collection-empty">Create a collection, then drag a card here.</div>}
{collections.map(x=><button className={`collection ${activeCollection===x?"active":""}`} key={x} onClick={()=>setActiveCollection(activeCollection===x?null:x)} onDragOver={handleCollectionDragOver} onDrop={(e)=>handleCollectionDrop(e,x)}><i />{x}<small>Drop</small></button>)}
<button className="new-collection" onClick={createCollection}>＋ New collection</button>
</div>
        <div className="sidebar-bottom"><button className="mini-nav" onClick={()=>setTheme(theme==="dark"?"light":"dark")}><span>◐</span> Appearance <small>{theme==="dark"?"Dark":"Light"}</small></button><button className="mini-nav" onClick={()=>notify("Settings panel will be connected next.")}><span>⚙</span> Settings</button><button className="account" onClick={()=>notify(userEmail ? `Signed in as ${userEmail}` : "Account details are loading.")}><div className="avatar">M</div><div><b>Manoj</b><small>{userEmail || "Signed in"}</small></div><span>•••</span></button></div>
      </aside>
      <main className="main">
        <header className="topbar"><button className="mobile-brand" onClick={()=>setViewAndReset("all")}><div className="brand-mark"><span /><i /></div><strong>My VaulT</strong></button><div className="breadcrumbs"><span>Vault</span><i>/</i><b>{view === "all" ? "All items" : view[0].toUpperCase()+view.slice(1)}</b></div><div className="top-actions"><button className="icon-btn" onClick={()=>document.getElementById("vault-search")?.focus()}>⌕</button><button className="icon-btn" onClick={()=>notify("Press / or use the search field to search your vault.")}>?</button><button className="profile" onClick={()=>notify(userEmail ? `Signed in as ${userEmail}` : "Account")}>M</button></div></header>
        <section className="content"><div className="section-capture-row"><button className="context-capture-btn" onClick={()=>setModal("capture")} disabled={saving || view === "trash"}>{contextualCaptureLabel}</button><span>Save something new without leaving this section.</span></div><div className="hero"><div><div className="eyebrow"><span className="live-dot" /> {loading ? "Loading your vault" : "Your vault is ready"}</div><h1>{title}</h1><p>Capture ideas, links, files and media. Find them instantly when you need them.</p></div><div className="hero-stat"><strong>{items.length}</strong><span>saved items</span></div></div>
          <div className="toolbar"><div className="search-wrap"><span>⌕</span><input id="vault-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your vault..." autoComplete="off"/><kbd>⌘ K</kbd></div><div className="toolbar-actions">{["all","recent","favorites"].map(x=><button key={x} className={`filter-btn ${filter===x?"active":""}`} onClick={()=>setFilter(x)}>{x==="favorites"?"★":x[0].toUpperCase()+x.slice(1)}</button>)}<button className={`view-btn ${layout==="grid"?"active":""}`} onClick={()=>setLayout("grid")}>▦</button><button className={`view-btn ${layout==="list"?"active":""}`} onClick={()=>setLayout("list")}>☷</button></div></div>
          <div className="chip-row">{["all","EV","Battery","Engineering","Project"].map(x=><button key={x} className={`chip ${tag===x?"active":""}`} onClick={()=>setTag(x)}>{x==="all"?"All":x}</button>)}</div>
          <div className="result-meta"><span>{activeCollection?`Collection: ${activeCollection} · `:""}{filtered.length} {filtered.length===1?"item":"items"}</span><button onClick={()=>setSearch("")}>Clear search</button></div>
          {loading ? <div className="empty"><div>◌</div><h3>Loading your vault…</h3><p>Fetching your saved items securely.</p></div> : view === "trash" ? <TrashBin notify={notify} onRestored={(restored)=>{setItems(current=>[restored,...current.filter(x=>x.id!==restored.id)]);setView("all");setActiveCollection(restored.collection ?? null);}} /> : filtered.length===0 ? <div className="empty"><div>⌕</div><h3>{search?"No matching items":"Your vault is empty"}</h3><p>{search?"Try another keyword, tag, or content type.":"Use Capture to add your first item."}</p></div> : <div className={`cards ${layout==="list"?"list":""}`}>{filtered.map(x=><article className="card" key={x.id} draggable onDragStart={(e)=>{e.dataTransfer.setData("text/my-vault-item", x.id);e.dataTransfer.setData("text/plain", x.id);e.dataTransfer.effectAllowed="move"}}><div className="card-top"><span className="type-badge">{typeIcon[x.type]} {typeLabel[x.type]}</span><button className={`favorite ${x.favorite?"on":""}`} onClick={()=>toggleFavorite(x.id)}>{x.favorite?"★":"☆"}</button></div><div className="card-body"><h3>{x.title}</h3><p>{x.content}</p><div className="tags">{x.tags.map(t=><span className="tag" key={t}>{t}</span>)}</div><div className="card-foot"><span>{x.date}</span><div className="card-actions">
<button title="Edit" onClick={()=>openEditor(x)}>✎</button>
<button title="Open" onClick={()=>openItem(x)}>↗</button>
{collections.length>0 && <select className="collection-select" value={x.collection ?? ""} onChange={e=>{const value=e.target.value;if(value) moveToCollection(x.id,value);}} title="Move to collection">
<option value="">Move…</option>
{collections.map(c=><option key={c} value={c}>{c}</option>)}
</select>}
<button title="Delete" className="danger-action" onClick={()=>deleteItem(x.id)}>⌫</button>
</div></div></div></article>)}</div>}
        </section>
      </main>
      <nav className="mobile-nav"><button className={`mobile-nav-item ${view==="all"?"active":""}`} onClick={()=>setViewAndReset("all")}><span>⌂</span><small>Home</small></button><button className={`mobile-nav-item ${view==="notes"?"active":""}`} onClick={()=>setViewAndReset("notes")}><span>▤</span><small>Notes</small></button><button className="mobile-capture" onClick={()=>setModal("capture")}><span>+</span></button><button className={`mobile-nav-item ${view==="favorites"?"active":""}`} onClick={()=>setViewAndReset("favorites")}><span>★</span><small>Saved</small></button><button className="mobile-nav-item" onClick={()=>notify("More controls will be connected next.")}><span>•••</span><small>More</small></button></nav>
      {modal==="capture"&&<div className="modal-backdrop open" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><section className="modal capture-modal"><button className="modal-close" onClick={()=>setModal(null)}>×</button><div className="modal-head"><span className="modal-icon gradient">+</span><div><h2>Capture something</h2><p>Choose the fastest way to add it to your vault.</p></div></div><div className="capture-options">{([ ["note","✎","Quick note","Write an idea or reminder"],["link","↗","Save link","URL, reel, post or article"],["media","◉","Photo / video","Camera or media from device"],["file","□","Upload file","PDF, document or any file"]] as const).map(([type,icon,label,desc])=><button className="capture-option" key={type} onClick={()=>type === "media" || type === "file" ? document.getElementById("vault-file-input")?.click() : createItem(type)}><span>{icon}</span><b>{label}</b><small>{desc}</small></button>)}</div><div className="capture-inputs"><label>📷 Take photo<input type="file" accept="image/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(file) void handleSelectedFile(file);e.currentTarget.value=""}}/></label><label>🎥 Take video<input type="file" accept="video/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(file) void handleSelectedFile(file);e.currentTarget.value=""}}/></label><label>📁 Choose any file<input id="vault-file-input" type="file" accept="*/*" onChange={e=>{const file=e.target.files?.[0];if(file) void handleSelectedFile(file);e.currentTarget.value=""}}/></label></div></section></div>}
      {modal==="editor"&&editingId&&<div className="modal-backdrop open" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><section className="modal editor-modal"><button className="modal-close" onClick={()=>setModal(null)}>×</button><div className="modal-head"><span className="modal-icon">{typeIcon[items.find(x=>x.id===editingId)?.type??"note"]}</span><div><h2>Edit item</h2><p>Changes are saved to your Supabase vault.</p></div></div><form onSubmit={saveEdit}><label>Title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required/></label><label>Tags<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} placeholder="EV, Battery, Project"/></label>{items.find(x=>x.id===editingId)?.type==="link"&&<label>URL<input type="url" value={form.url} onChange={e=>setForm({...form,url:e.target.value})} placeholder="https://..."/></label>}<label>Content / description<textarea rows={7} value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder="Write or paste content..."/></label><div className="editor-actions"><button type="button" className="ghost" onClick={()=>setModal(null)}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving?"Saving…":"Save changes"}</button></div></form></section></div>}
      {toast&&<div className="toast show">{toast}</div>}
    </div>
  );
}
