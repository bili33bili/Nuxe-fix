import type { ProjectMeta, ProjectNode } from "@/engine/types";

const DB_NAME = "project-forge";
const DB_VERSION = 1;
const PROJECTS = "projects";
const NODES = "nodes";

let dbPromise: Promise<IDBDatabase> | null = null;

export function isStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function openDB(): Promise<IDBDatabase> {
  if (!isStorageAvailable()) {
    return Promise.reject(new Error("IndexedDB tidak tersedia di browser ini."));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS)) {
        db.createObjectStore(PROJECTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(NODES)) {
        const s = db.createObjectStore(NODES, { keyPath: "id" });
        s.createIndex("projectId", "projectId", { unique: false });
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error("Tidak dapat membuka penyimpanan lokal."));
    req.onblocked = () => reject(new Error("Penyimpanan lokal diblokir oleh tab lain."));
  });
  return dbPromise;
}

function tx<T>(
  store: string | string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        let result: T;
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? new Error("Transaksi penyimpanan gagal."));
        t.onabort = () => reject(t.error ?? new Error("Transaksi penyimpanan dibatalkan."));
        Promise.resolve(run(t))
          .then((r) => {
            result = r;
          })
          .catch((e) => {
            try {
              t.abort();
            } catch {
              /* ignore */
            }
            reject(e);
          });
      }),
  );
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const rows = await tx(PROJECTS, "readonly", (t) =>
    reqToPromise(t.objectStore(PROJECTS).getAll() as IDBRequest<ProjectMeta[]>),
  );
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putProject(meta: ProjectMeta): Promise<void> {
  await tx(PROJECTS, "readwrite", (t) => {
    t.objectStore(PROJECTS).put(meta);
  });
}

export async function getProject(id: string): Promise<ProjectMeta | undefined> {
  return tx(PROJECTS, "readonly", (t) =>
    reqToPromise(t.objectStore(PROJECTS).get(id) as IDBRequest<ProjectMeta | undefined>),
  );
}

export async function loadNodes(projectId: string): Promise<ProjectNode[]> {
  return tx(NODES, "readonly", (t) =>
    reqToPromise(
      t.objectStore(NODES).index("projectId").getAll(projectId) as IDBRequest<ProjectNode[]>,
    ),
  );
}

/** Batched write: puts and deletes in a single transaction. */
export async function commitNodes(
  puts: ProjectNode[],
  deletes: string[],
  meta?: ProjectMeta,
): Promise<void> {
  const stores = meta ? [NODES, PROJECTS] : [NODES];
  await tx(stores, "readwrite", (t) => {
    const s = t.objectStore(NODES);
    for (const n of puts) s.put(n);
    for (const id of deletes) s.delete(id);
    if (meta) t.objectStore(PROJECTS).put(meta);
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  const nodes = await loadNodes(projectId);
  await tx([NODES, PROJECTS], "readwrite", (t) => {
    const s = t.objectStore(NODES);
    for (const n of nodes) s.delete(n.id);
    t.objectStore(PROJECTS).delete(projectId);
  });
}

const LAST_KEY = "project-forge:last-project";

export function getLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastProjectId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    /* ignore */
  }
}
