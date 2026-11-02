import {
  byteSize,
  uid,
  type ProjectMeta,
  type ProjectNode,
  type ProjectStats,
  type SaveState,
} from "./types";
import {
  commitNodes,
  deleteProject as dbDeleteProject,
  getLastProjectId,
  listProjects,
  loadNodes,
  putProject,
  setLastProjectId,
} from "@/storage/db";

export interface PatchEntry {
  id: string;
  before: ProjectNode | null;
  after: ProjectNode | null;
}

type Listener = () => void;

export class ProjectEngine {
  meta: ProjectMeta | null = null;
  nodes = new Map<string, ProjectNode>();
  saveState: SaveState = "idle";
  storageError: string | null = null;
  ready = false;

  private listeners = new Set<Listener>();
  private undoStack: PatchEntry[][] = [];
  private redoStack: PatchEntry[][] = [];
  private pendingPuts = new Map<string, ProjectNode>();
  private pendingDeletes = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshotVersion = 0;

  /* ---------------- subscription ---------------- */
  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.snapshotVersion;
  private emit() {
    this.snapshotVersion++;
    this.listeners.forEach((l) => l());
  }

  /* ---------------- queries ---------------- */
  childrenOf(parentId: string | null): ProjectNode[] {
    const out: ProjectNode[] = [];
    for (const n of this.nodes.values()) if (n.parentId === parentId) out.push(n);
    out.sort((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name, undefined, { numeric: true })
        : a.type === "folder"
          ? -1
          : 1,
    );
    return out;
  }

  get(id: string | null): ProjectNode | undefined {
    return id ? this.nodes.get(id) : undefined;
  }

  pathOf(id: string): string {
    const parts: string[] = [];
    let cur = this.nodes.get(id);
    let guard = 0;
    while (cur && guard++ < 5000) {
      parts.unshift(cur.name);
      cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined;
    }
    return parts.join("/");
  }

  isDescendant(candidateId: string, ancestorId: string): boolean {
    let cur = this.nodes.get(candidateId);
    let guard = 0;
    while (cur && guard++ < 10000) {
      if (cur.id === ancestorId) return true;
      cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined;
    }
    return false;
  }

  descendantsOf(id: string): ProjectNode[] {
    const out: ProjectNode[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of this.nodes.values()) {
        if (n.parentId === cur) {
          out.push(n);
          if (n.type === "folder") stack.push(n.id);
        }
      }
    }
    return out;
  }

  stats(): ProjectStats {
    let files = 0;
    let folders = 0;
    let totalSize = 0;
    for (const n of this.nodes.values()) {
      if (n.type === "folder") folders++;
      else {
        files++;
        totalSize += n.size ?? 0;
      }
    }
    return { files, folders, totalSize };
  }

  folderOptions(): { id: string | null; label: string }[] {
    const list: { id: string | null; label: string }[] = [{ id: null, label: "Root" }];
    for (const n of this.nodes.values())
      if (n.type === "folder") list.push({ id: n.id, label: this.pathOf(n.id) });
    list.sort((a, b) => (a.id === null ? -1 : b.id === null ? 1 : a.label.localeCompare(b.label)));
    return list;
  }

  nameTaken(parentId: string | null, name: string, exceptId?: string): boolean {
    for (const n of this.nodes.values())
      if (n.parentId === parentId && n.name === name && n.id !== exceptId) return true;
    return false;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }

  /* ---------------- persistence ---------------- */
  private queue(entries: PatchEntry[]) {
    for (const e of entries) {
      if (e.after) {
        this.pendingPuts.set(e.id, e.after);
        this.pendingDeletes.delete(e.id);
      } else {
        this.pendingPuts.delete(e.id);
        this.pendingDeletes.add(e.id);
      }
    }
    this.scheduleFlush();
  }

  private scheduleFlush(delay = 500) {
    if (!this.meta) return;
    this.saveState = "saving";
    this.emit();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), delay);
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.meta) return;
    const puts = [...this.pendingPuts.values()];
    const dels = [...this.pendingDeletes];
    this.pendingPuts.clear();
    this.pendingDeletes.clear();
    const meta: ProjectMeta = { ...this.meta, updatedAt: Date.now() };
    this.meta = meta;
    try {
      await commitNodes(puts, dels, meta);
      this.saveState = "saved";
      this.storageError = null;
    } catch (err) {
      // Keep changes queued so nothing is lost.
      for (const p of puts) this.pendingPuts.set(p.id, p);
      for (const d of dels) this.pendingDeletes.add(d);
      this.saveState = "error";
      this.storageError = err instanceof Error ? err.message : "Tidak dapat menyimpan secara lokal.";
    }
    this.emit();
  }

  /* ---------------- patch application ---------------- */
  private applyEntries(entries: PatchEntry[], direction: "forward" | "backward") {
    for (const e of entries) {
      const target = direction === "forward" ? e.after : e.before;
      if (target) this.nodes.set(e.id, target);
      else this.nodes.delete(e.id);
    }
    const persisted =
      direction === "forward"
        ? entries
        : entries.map((e) => ({ id: e.id, before: e.after, after: e.before }));
    this.queue(persisted);
  }

  private commit(entries: PatchEntry[], recordHistory = true) {
    if (!entries.length) return;
    this.applyEntries(entries, "forward");
    if (recordHistory) {
      this.undoStack.push(entries);
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
    }
    this.emit();
  }

  undo(): boolean {
    const entries = this.undoStack.pop();
    if (!entries) return false;
    this.applyEntries(entries, "backward");
    this.redoStack.push(entries);
    this.emit();
    return true;
  }

  redo(): boolean {
    const entries = this.redoStack.pop();
    if (!entries) return false;
    this.applyEntries(entries, "forward");
    this.undoStack.push(entries);
    this.emit();
    return true;
  }

  /* ---------------- project lifecycle ---------------- */
  async init(): Promise<void> {
    try {
      const last = getLastProjectId();
      if (last) {
        const projects = await listProjects();
        const found = projects.find((p) => p.id === last);
        if (found) await this.openProject(found.id);
      }
    } catch (err) {
      this.storageError = err instanceof Error ? err.message : "Penyimpanan tidak tersedia.";
    }
    this.ready = true;
    this.emit();
  }

  async openProject(id: string): Promise<void> {
    const [nodes, projects] = await Promise.all([loadNodes(id), listProjects()]);
    const meta = projects.find((p) => p.id === id);
    if (!meta) throw new Error("Proyek tidak ditemukan.");
    await this.flush();
    this.meta = meta;
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
    this.undoStack = [];
    this.redoStack = [];
    this.saveState = "saved";
    setLastProjectId(id);
    this.emit();
  }

  closeProject() {
    this.meta = null;
    this.nodes = new Map();
    this.undoStack = [];
    this.redoStack = [];
    setLastProjectId(null);
    this.emit();
  }

  async createProject(name: string, seed?: { path: string; content?: string | undefined }[]): Promise<string> {
    await this.flush();
    const now = Date.now();
    const meta: ProjectMeta = {
      id: uid(),
      name: name.trim() || "Proyek Tanpa Judul",
      createdAt: now,
      updatedAt: now,
      storageType: "local",
    };
    await putProject(meta);
    this.meta = meta;
    this.nodes = new Map();
    this.undoStack = [];
    this.redoStack = [];
    setLastProjectId(meta.id);
    if (seed?.length) this.applyPaths(seed, false);
    await this.flush();
    this.emit();
    return meta.id;
  }

  async renameProject(name: string): Promise<void> {
    if (!this.meta) return;
    this.meta = { ...this.meta, name: name.trim() || this.meta.name };
    this.scheduleFlush(0);
  }

  async renameProjectById(id: string, name: string): Promise<void> {
    if (this.meta?.id === id) return this.renameProject(name);
    const projects = await listProjects();
    const meta = projects.find((p) => p.id === id);
    if (!meta) return;
    await putProject({ ...meta, name: name.trim() || meta.name, updatedAt: Date.now() });
  }

  async duplicateProject(id: string): Promise<string> {
    const projects = await listProjects();
    const src = projects.find((p) => p.id === id);
    if (!src) throw new Error("Proyek tidak ditemukan.");
    const nodes = id === this.meta?.id ? [...this.nodes.values()] : await loadNodes(id);
    const now = Date.now();
    const meta: ProjectMeta = {
      id: uid(),
      name: `${src.name} salinan`,
      createdAt: now,
      updatedAt: now,
      storageType: "local",
    };
    const idMap = new Map<string, string>();
    for (const n of nodes) idMap.set(n.id, uid());
    const clones = nodes.map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
      projectId: meta.id,
      parentId: n.parentId ? (idMap.get(n.parentId) ?? null) : null,
    }));
    await putProject(meta);
    await commitNodes(clones, []);
    return meta.id;
  }

  async deleteProjectById(id: string): Promise<void> {
    await dbDeleteProject(id);
    if (this.meta?.id === id) this.closeProject();
  }

  /* ---------------- node operations ---------------- */
  private newNode(
    parentId: string | null,
    name: string,
    type: "file" | "folder",
    content?: string,
  ): ProjectNode {
    const now = Date.now();
    return {
      id: uid(),
      projectId: this.meta!.id,
      parentId,
      name,
      type,
      content: type === "file" ? (content ?? "") : undefined,
      size: type === "file" ? byteSize(content ?? "") : undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  createNode(
    parentId: string | null,
    name: string,
    type: "file" | "folder",
    content?: string,
  ): ProjectNode {
    if (!this.meta) throw new Error("Tidak ada proyek yang terbuka.");
    const clean = name.trim();
    if (!clean) throw new Error("Nama tidak boleh kosong.");
    if (clean.includes("/") || clean.includes("\\"))
      throw new Error("Nama tidak boleh mengandung garis miring.");
    if (this.nameTaken(parentId, clean)) throw new Error(`"${clean}" sudah ada di sini.`);
    const node = this.newNode(parentId, clean, type, content);
    this.commit([{ id: node.id, before: null, after: node }]);
    return node;
  }

  rename(id: string, name: string) {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Item tidak ditemukan.");
    const clean = name.trim();
    if (!clean) throw new Error("Nama tidak boleh kosong.");
    if (clean.includes("/") || clean.includes("\\"))
      throw new Error("Nama tidak boleh mengandung garis miring.");
    if (this.nameTaken(node.parentId, clean, id)) throw new Error(`"${clean}" sudah ada di sini.`);
    this.commit([
      { id, before: node, after: { ...node, name: clean, updatedAt: Date.now() } },
    ]);
  }

  remove(id: string) {
    const node = this.nodes.get(id);
    if (!node) return;
    const all = [node, ...this.descendantsOf(id)];
    this.commit(all.map((n) => ({ id: n.id, before: n, after: null })));
  }

  move(id: string, newParentId: string | null) {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Item tidak ditemukan.");
    if (newParentId === node.parentId) return;
    if (newParentId && node.type === "folder" && this.isDescendant(newParentId, id))
      throw new Error("Tidak dapat memindahkan folder ke dalam dirinya sendiri.");
    if (newParentId) {
      const parent = this.nodes.get(newParentId);
      if (!parent || parent.type !== "folder") throw new Error("Target bukan folder.");
    }
    if (this.nameTaken(newParentId, node.name, id))
      throw new Error(`"${node.name}" sudah ada di tujuan.`);
    this.commit([
      { id, before: node, after: { ...node, parentId: newParentId, updatedAt: Date.now() } },
    ]);
  }

  duplicate(id: string): ProjectNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Item tidak ditemukan.");
    let base = `${stripExt(node.name)} salinan`;
    const ext = extOf(node.name);
    let candidate = base + ext;
    let i = 2;
    while (this.nameTaken(node.parentId, candidate)) candidate = `${base} ${i++}${ext}`;
    const entries: PatchEntry[] = [];
    const root: ProjectNode = {
      ...node,
      id: uid(),
      name: candidate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    entries.push({ id: root.id, before: null, after: root });
    if (node.type === "folder") {
      const map = new Map<string, string>([[node.id, root.id]]);
      for (const d of this.descendantsOf(id)) {
        const clone: ProjectNode = { ...d, id: uid(), parentId: map.get(d.parentId!) ?? root.id };
        map.set(d.id, clone.id);
        entries.push({ id: clone.id, before: null, after: clone });
      }
    }
    this.commit(entries);
    return root;
  }

  setContent(id: string, content: string) {
    const node = this.nodes.get(id);
    if (!node || node.type !== "file") return;
    if (node.content === content) return;
    this.commit([
      {
        id,
        before: node,
        after: { ...node, content, size: byteSize(content), updatedAt: Date.now() },
      },
    ]);
  }

  /* ---------------- bulk / path helpers ---------------- */
  ensureFolderPath(segments: string[], cache?: Map<string, string>, out?: PatchEntry[]): string | null {
    let parent: string | null = null;
    let key = "";
    for (const seg of segments) {
      key += "/" + seg;
      const cached = cache?.get(key);
      if (cached) {
        parent = cached;
        continue;
      }
      let existing: ProjectNode | undefined;
      for (const n of this.nodes.values())
        if (n.parentId === parent && n.name === seg && n.type === "folder") existing = n;
      if (!existing) {
        existing = this.newNode(parent, seg, "folder");
        this.nodes.set(existing.id, existing);
        out?.push({ id: existing.id, before: null, after: existing });
      }
      cache?.set(key, existing.id);
      parent = existing.id;
    }
    return parent;
  }

  /** Adds a list of paths (folders end with "/") into the project. */
  applyPaths(items: { path: string; content?: string | undefined }[], recordHistory = true) {
    if (!this.meta) throw new Error("Tidak ada proyek yang terbuka.");
    const entries: PatchEntry[] = [];
    const cache = new Map<string, string>();
    for (const item of items) {
      const isFolder = item.path.endsWith("/");
      const segs = item.path.split("/").filter(Boolean);
      if (!segs.length) continue;
      if (isFolder) {
        this.ensureFolderPath(segs, cache, entries);
      } else {
        const name = segs.pop()!;
        const parent = this.ensureFolderPath(segs, cache, entries);
        let exists: ProjectNode | undefined;
        for (const n of this.nodes.values())
          if (n.parentId === parent && n.name === name) exists = n;
        if (exists) {
          if (exists.type === "file" && item.content !== undefined) {
            const after = {
              ...exists,
              content: item.content,
              size: byteSize(item.content),
              updatedAt: Date.now(),
            };
            this.nodes.set(exists.id, after);
            entries.push({ id: exists.id, before: exists, after });
          }
          continue;
        }
        const node = this.newNode(parent, name, "file", item.content ?? "");
        this.nodes.set(node.id, node);
        entries.push({ id: node.id, before: null, after: node });
      }
    }
    // nodes already mutated above; register history + persistence
    this.queue(entries);
    if (recordHistory && entries.length) {
      this.undoStack.push(entries);
      this.redoStack = [];
    }
    this.emit();
    return entries.length;
  }

  /** Replaces the whole project content (used by ZIP/JSON import, validated first). */
  replaceAll(items: { path: string; content?: string | undefined }[], projectName?: string) {
    if (!this.meta) throw new Error("Tidak ada proyek yang terbuka.");
    const entries: PatchEntry[] = [...this.nodes.values()].map((n) => ({
      id: n.id,
      before: n,
      after: null,
    }));
    for (const e of entries) this.nodes.delete(e.id);
    const added: PatchEntry[] = [];
    const cache = new Map<string, string>();
    for (const item of items) {
      const isFolder = item.path.endsWith("/");
      const segs = item.path.split("/").filter(Boolean);
      if (!segs.length) continue;
      if (isFolder) this.ensureFolderPath(segs, cache, added);
      else {
        const name = segs.pop()!;
        const parent = this.ensureFolderPath(segs, cache, added);
        const node = this.newNode(parent, name, "file", item.content ?? "");
        this.nodes.set(node.id, node);
        added.push({ id: node.id, before: null, after: node });
      }
    }
    const all = [...entries, ...added];
    this.queue(all);
    this.undoStack.push(all);
    this.redoStack = [];
    if (projectName && this.meta) this.meta = { ...this.meta, name: projectName };
    this.emit();
  }

  /** Flat list of files for export. */
  fileList(): { path: string; content: string }[] {
    const out: { path: string; content: string }[] = [];
    for (const n of this.nodes.values())
      if (n.type === "file") out.push({ path: this.pathOf(n.id), content: n.content ?? "" });
    return out;
  }

  folderList(): string[] {
    const out: string[] = [];
    for (const n of this.nodes.values()) if (n.type === "folder") out.push(this.pathOf(n.id) + "/");
    return out;
  }
}

export function stripExt(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}
export function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i) : "";
}

export const engine = new ProjectEngine();
