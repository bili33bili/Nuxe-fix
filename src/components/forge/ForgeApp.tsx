import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import {
  Command as CommandIcon,
  Download,
  FileDown,
  FilePlus2,
  FolderPlus,
  FolderInput,
  Hammer,
  Menu,
  Moon,
  Package,
  Redo2,
  Save,
  Search,
  Sun,
  Undo2,
  Upload,
  Wand2,
  Radio,
  Mail,
  X,
  Eye,
  Database,
} from "lucide-react";
import { engine } from "@/engine/projectEngine";
import { useEngine } from "@/hooks/useEngine";
import { formatBytes, type ProjectNode } from "@/engine/types";
import { FileExplorer } from "./FileExplorer";
import { EditorPane } from "./EditorPane";
import { AssistBar } from "./AssistBar";
import { FillAllDialog } from "./FillAllDialog";


import { CommandPalette, type Command } from "./CommandPalette";
import { ProjectLibrary } from "./ProjectLibrary";
import { ShareDialog } from "./ShareDialog";
import { ApprovalDialog } from "./ApprovalDialog";
import { TermuxDialog } from "./TermuxDialog";
import { PreviewPanel } from "./PreviewPanel";
import { Actions, ErrorText, Field, Modal, Select, TextInput } from "./Dialogs";
import { parseStructure, stripRoot, validatePaths } from "@/lib/structureParser";
import { binaryBlob, buildZip, downloadBlob, downloadText, isBinaryContent, readDeviceFile, readZip, type ZipProgress } from "@/lib/zipService";
import { listProjects, loadNodes } from "@/storage/db";
import { cn } from "@/lib/utils";

const EXAMPLE: { path: string; content?: string | undefined }[] = [
  { path: "index.html", content: "<!DOCTYPE html>\n<html>\n  <head>\n    <link rel=\"stylesheet\" href=\"style.css\" />\n  </head>\n  <body>\n    <h1>Hello Forge</h1>\n    <script src=\"js/main.js\"></script>\n  </body>\n</html>\n" },
  { path: "style.css", content: "body { font-family: system-ui; margin: 2rem; }\n" },
  { path: "js/main.js", content: "console.log('main loaded');\n" },
  { path: "js/player.js", content: "export function play() {}\n" },
  { path: "assets/images/", content: undefined },
];

type Dialog =
  | { kind: "newProject" }
  | { kind: "newFile"; parentId: string | null }
  | { kind: "newFolder"; parentId: string | null }
  | { kind: "rename"; id: string }
  | { kind: "renameProject" }
  | { kind: "delete"; id: string }
  | { kind: "move"; id: string }
  | { kind: "structure" }
  | null;

type Theme = "dark" | "light";

export function ForgeApp() {
  const eng = useEngine();
  useEngine();
  const [booting, setBooting] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menu, setMenu] = useState<{ node: ProjectNode | null; x: number; y: number } | null>(null);
  const [zip, setZip] = useState<{ label: string; p: ZipProgress } | null>(null);
  const [fillOpen, setFillOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [termuxOpen, setTermuxOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("terima")) setShareOpen(true);
  }, []);
  const zipCancel = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const notify = useCallback((type: "success" | "error" | "info", message: string) => {
    if (type === "success") toast.success(message);
    else if (type === "error") toast.error(message);
    else toast.info(message);
  }, []);

  /* ---------- boot ---------- */
  useEffect(() => {
    const saved = (localStorage.getItem("forge:theme") as Theme) ?? "dark";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
    engine
      .init()
      .catch((e) => notify("error", (e as Error).message))
      .finally(() => setTimeout(() => setBooting(false), 450));
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { type: "error"; message: string };
      notify(d.type, d.message);
    };
    window.addEventListener("forge:toast", onToast);
    return () => window.removeEventListener("forge:toast", onToast);
  }, [notify]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (mod && e.key.toLowerCase() === "f" && !e.shiftKey) {
        e.preventDefault();
        setSidebarOpen(true);
        setTimeout(() => searchInput.current?.focus(), 60);
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((s) => !s);
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        engine.redo();
      } else if (mod && e.key.toLowerCase() === "z" && !isEditorFocused()) {
        e.preventDefault();
        engine.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  useEffect(() => {
    const beforeUnload = () => void engine.flush();
    window.addEventListener("pagehide", beforeUnload);
    return () => window.removeEventListener("pagehide", beforeUnload);
  }, []);

  const isEditorFocused = () =>
    !!document.activeElement?.closest(".monaco-editor, input, textarea");

  /* ---------- tabs & editing ---------- */
  const openFile = (node: ProjectNode) => {
    if (node.type !== "file") return;
    setTabs((t) => (t.includes(node.id) ? t : [...t, node.id]));
    setActiveTab(node.id);
    setBuffers((b) => (node.id in b ? b : { ...b, [node.id]: node.content ?? "" }));
    setSidebarOpen(false);
  };

  const closeTab = (id: string) => {
    if (dirty.has(id)) {
      flushBuffer(id);
    }
    setTabs((t) => t.filter((x) => x !== id));
    setActiveTab((a) => (a === id ? (tabs.filter((x) => x !== id).slice(-1)[0] ?? null) : a));
  };

  const flushBuffer = (id: string) => {
    const content = buffers[id];
    if (content === undefined) return;
    try {
      engine.setContent(id, content);
      setDirty((d) => {
        const n = new Set(d);
        n.delete(id);
        return n;
      });
    } catch (e) {
      notify("error", (e as Error).message);
    }
  };

  const onEdit = (id: string, value: string) => {
    setBuffers((b) => ({ ...b, [id]: value }));
    setDirty((d) => new Set(d).add(id));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        engine.setContent(id, value);
        setDirty((d) => {
          const n = new Set(d);
          n.delete(id);
          return n;
        });
      } catch (e) {
        notify("error", (e as Error).message);
      }
    }, 700);
  };

  const saveNow = async () => {
    for (const id of dirty) flushBuffer(id);
    await engine.flush();
    notify("success", "Tersimpan secara lokal");
  };

  // Keep buffers in sync when the engine changes content (undo/redo, import).
  useEffect(() => {
    setBuffers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        const node = engine.get(id);
        if (!node) {
          delete next[id];
          changed = true;
        } else if (!dirty.has(id) && node.content !== undefined && node.content !== prev[id]) {
          next[id] = node.content;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setTabs((t) => t.filter((id) => engine.get(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eng.getVersion()]);

  useEffect(() => {
    if (activeTab && !engine.get(activeTab)) setActiveTab(tabs[tabs.length - 1] ?? null);
  }, [tabs, activeTab, eng]);

  /* ---------- project actions ---------- */
  const createProject = async (name: string, example: boolean) => {
    try {
      await engine.createProject(name, example ? EXAMPLE : []);
      setTabs([]);
      setActiveTab(null);
      setBuffers({});
      setDirty(new Set());
      setExpanded(new Set());
      notify("success", "Proyek dibuat");
    } catch (e) {
      notify("error", (e as Error).message);
    }
  };

  const exportZip = async () => {
    if (!engine.meta) return;
    zipCancel.current = false;
    const files = engine.fileList();
    const folders = engine.folderList();
    setZip({
      label: "Membuat ZIP…",
      p: { processed: 0, total: files.length, files: files.length, folders: folders.length, phase: "collecting" },
    });
    try {
      const blob = await buildZip(
        engine.meta.name.replace(/[\\/:*?"<>|]/g, "-"),
        files,
        folders,
        (p) => setZip((z) => (z ? { ...z, p } : z)),
        () => zipCancel.current,
      );
      if (!blob) {
        notify("info", "ZIP dibatalkan");
      } else {
        downloadBlob(blob, `${engine.meta.name.replace(/[\\/:*?"<>|]/g, "-")}.zip`);
        notify("success", "ZIP siap");
      }
    } catch (e) {
      notify("error", `Tidak dapat membuat ZIP. ${(e as Error).message}`);
    }
    setZip(null);
  };

  const importZip = async (file: File) => {
    setZip({
      label: "Mengimpor ZIP…",
      p: { processed: 0, total: 0, files: 0, folders: 0, phase: "reading" },
    });
    try {
      const { items, rootName } = await readZip(file, (p) => setZip((z) => (z ? { ...z, p } : z)));
      const stripped = rootName
        ? items
            .filter((i) => i.path !== rootName + "/")
            .map((i) => ({
              path: i.path.startsWith(rootName + "/") ? i.path.slice(rootName.length + 1) : i.path,
              ...(i.content !== undefined ? { content: i.content } : {}),
            }))
            .filter((i) => i.path)
        : items;
      validatePaths(stripped);
      await engine.createProject(rootName ?? file.name.replace(/\.zip$/i, ""), stripped);
      await engine.flush();
      if (engine.saveState === "error") throw new Error("Penyimpanan lokal penuh atau tidak tersedia.");
      setTabs([]);
      setActiveTab(null);
      setBuffers({});
      setDirty(new Set());
      notify("success", "ZIP diimpor sebagai proyek baru beserta isi file");
    } catch (e) {
      notify("error", `Tidak dapat mengimpor ZIP. Proyek Anda yang ada tidak diubah. ${(e as Error).message}`);
    }
    setZip(null);
  };

  const importFolder = async (files: File[]) => {
    if (!files.length) return;
    setZip({ label: "Mengimpor folder…", p: { processed: 0, total: files.length, files: files.length, folders: 0, phase: "reading" } });
    try {
      const items: { path: string; content: string }[] = [];
      for (const [index, file] of files.entries()) {
        const path = file.webkitRelativePath || file.name;
        items.push({ path, content: await readDeviceFile(file) });
        setZip((z) => z ? { ...z, p: { ...z.p, processed: index + 1 } } : z);
        if (zipCancel.current) throw new Error("Impor dibatalkan.");
      }
      validatePaths(items);
      const root = items[0]?.path.split("/")[0] ?? "Folder impor";
      const stripped = items.every((item) => item.path.startsWith(root + "/"))
        ? items.map((item) => ({ ...item, path: item.path.slice(root.length + 1) })) : items;
      validatePaths(stripped);
      await engine.createProject(root, stripped);
      await engine.flush();
      if (engine.saveState === "error") throw new Error("Penyimpanan lokal penuh atau tidak tersedia.");
      setTabs([]); setActiveTab(null); setBuffers({}); setDirty(new Set()); setExpanded(new Set());
      notify("success", "Folder diimpor sebagai proyek baru beserta isi file");
    } catch (e) {
      notify("error", `Folder tidak dapat diimpor. Proyek lama tetap ada. ${(e as Error).message}`);
    } finally { setZip(null); zipCancel.current = false; }
  };

  const exportJson = async (projectId?: string) => {
    try {
      const id = projectId ?? engine.meta?.id;
      if (!id) return;
      const metas = await listProjects();
      const meta = metas.find((m) => m.id === id);
      if (!meta) throw new Error("Proyek tidak ditemukan.");
      const nodes = id === engine.meta?.id ? [...engine.nodes.values()] : await loadNodes(id);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const pathOf = (n: (typeof nodes)[number]) => {
        const parts = [n.name];
        let cur = n.parentId ? byId.get(n.parentId) : undefined;
        while (cur) {
          parts.unshift(cur.name);
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
        return parts.join("/");
      };
      const payload = {
        format: "project-forge",
        version: 1,
        name: meta.name,
        exportedAt: Date.now(),
        items: nodes.map((n) => ({
          path: n.type === "folder" ? pathOf(n) + "/" : pathOf(n),
          content: n.type === "file" ? (n.content ?? "") : undefined,
        })),
      };
      downloadText(JSON.stringify(payload, null, 2), `${meta.name}.project.json`);
      notify("success", "Proyek diekspor");
    } catch (e) {
      notify("error", (e as Error).message);
    }
  };

  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.items)) throw new Error("Isi file tidak sesuai.");
      const items = data.items
        .filter((i: unknown) => i && typeof (i as { path: unknown }).path === "string")
        .map((i: { path: string; content?: string }) => ({ path: i.path, content: i.content }));
      if (!items.length) throw new Error("Tidak ada file yang ditemukan dalam cadangan.");
      if (!engine.meta) await engine.createProject(data.name ?? "Imported Project");
      engine.replaceAll(items, typeof data.name === "string" ? data.name : undefined);
      await engine.flush();
      setTabs([]);
      setActiveTab(null);
      setBuffers({});
      notify("success", "Proyek dipulihkan");
    } catch (e) {
      notify("error", `Tidak dapat mengimpor cadangan. Proyek Anda yang ada tidak diubah. ${(e as Error).message}`);
    }
  };

  const downloadNode = (node: ProjectNode) => {
    if (node.type === "file") downloadBlob(isBinaryContent(node.content ?? "") ? binaryBlob(node.content ?? "") : new Blob([node.content ?? ""], { type: "text/plain;charset=utf-8" }), node.name);
    else notify("info", "Gunakan Ekspor ZIP untuk mengunduh folder.");
  };

  /* ---------- commands ---------- */
  const commands: Command[] = useMemo(() => {
    const hasProject = !!engine.meta;
    const active = activeTab ? engine.get(activeTab) : undefined;
    return [
      { id: "np", group: "Proyek", label: "Proyek Baru", run: () => setDialog({ kind: "newProject" }) },
      { id: "gmail", group: "Transfer", label: "Kirim ke web lain (persetujuan Gmail)", run: () => setApprovalOpen(true) },
      { id: "termux", group: "Transfer", label: "Database Termux (kirim/ambil)", run: () => setTermuxOpen(true) },
      { id: "p2p", group: "Transfer", label: "Kirim / Terima P2P", run: () => setShareOpen(true) },
      { id: "lib", group: "Proyek", label: "Pustaka Proyek", run: () => setLibraryOpen(true) },
      {
        id: "rnp",
        group: "Proyek",
        label: "Ganti Nama Proyek",
        disabled: !hasProject,
        run: () => setDialog({ kind: "renameProject" }),
      },
      {
        id: "nf",
        group: "Berkas",
        label: "File Baru",
        disabled: !hasProject,
        run: () => setDialog({ kind: "newFile", parentId: folderContext(selected) }),
      },
      {
        id: "nd",
        group: "Berkas",
        label: "Folder Baru",
        disabled: !hasProject,
        run: () => setDialog({ kind: "newFolder", parentId: folderContext(selected) }),
      },
      { id: "gen", group: "Berkas", label: "Buat Dari Struktur", run: () => setDialog({ kind: "structure" }) },
      {
        id: "fill",
        group: "Berkas",
        label: "Isi Semua File",
        disabled: !hasProject,
        run: () => setFillOpen(true),
      },
      {
        id: "dl",
        group: "Berkas",
        label: "Unduh File Aktif",
        disabled: !active,
        run: () => active && downloadNode(active),
      },
      {
        id: "cp",
        group: "Berkas",
        label: "Salin Jalur File Aktif",
        disabled: !active,
        run: () => {
          if (!active) return;
          void navigator.clipboard?.writeText(engine.pathOf(active.id));
          notify("success", "Jalur disalin");
        },
      },
      {
        id: "save",
        group: "Edit",
        label: "Simpan",
        hint: "Ctrl+S",
        disabled: !hasProject,
        run: () => void saveNow(),
      },
      { id: "undo", group: "Edit", label: "Urungkan", hint: "Ctrl+Z", disabled: !engine.canUndo(), run: () => engine.undo() },
      {
        id: "redo",
        group: "Edit",
        label: "Ulangi",
        hint: "Ctrl+Shift+Z",
        disabled: !engine.canRedo(),
        run: () => engine.redo(),
      },
      {
        id: "closetab",
        group: "Edit",
        label: "Tutup Tab Aktif",
        disabled: !activeTab,
        run: () => activeTab && closeTab(activeTab),
      },
      {
        id: "closeall",
        group: "Edit",
        label: "Tutup Semua Tab",
        disabled: tabs.length === 0,
        run: () => {
          for (const id of tabs) if (dirty.has(id)) flushBuffer(id);
          setTabs([]);
          setActiveTab(null);
        },
      },
      {
        id: "zip",
        group: "Transfer",
        label: "Ekspor ZIP",
        disabled: !hasProject,
        run: () => void exportZip(),
      },
      { id: "izip", group: "Transfer", label: "Impor ZIP", run: () => zipInput.current?.click() },
      { id: "ifolder", group: "Transfer", label: "Impor Folder", run: () => folderInput.current?.click() },
      {
        id: "ej",
        group: "Transfer",
        label: "Ekspor Proyek (JSON)",
        disabled: !hasProject,
        run: () => void exportJson(),
      },
      { id: "ij", group: "Transfer", label: "Impor Proyek (JSON)", run: () => jsonInput.current?.click() },
      {
        id: "find",
        group: "Tampilan",
        label: "Cari File",
        hint: "Ctrl+F",
        disabled: !hasProject,
        run: () => {
          setSidebarOpen(true);
          setTimeout(() => searchInput.current?.focus(), 60);
        },
      },
      {
        id: "sb",
        group: "Tampilan",
        label: "Tampilkan/Sembunyikan Penjelajah",
        hint: "Ctrl+B",
        disabled: !hasProject,
        run: () => setSidebarOpen((s) => !s),
      },
      { id: "th", group: "Tampilan", label: "Ganti Tema", run: () => toggleTheme() },
      {
        id: "ea",
        group: "Tampilan",
        label: "Perluas Semua",
        disabled: !hasProject,
        run: () =>
          setExpanded(new Set([...engine.nodes.values()].filter((n) => n.type === "folder").map((n) => n.id))),
      },
      { id: "ca", group: "Tampilan", label: "Ciutkan Semua", disabled: !hasProject, run: () => setExpanded(new Set()) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, dirty, theme, tabs, activeTab, eng.getVersion()]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("forge:theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const folderContext = (id: string | null): string | null => {
    const node = id ? engine.get(id) : undefined;
    if (!node) return null;
    return node.type === "folder" ? node.id : node.parentId;
  };

  const stats = engine.stats();
  const activeNode = activeTab ? engine.get(activeTab) : undefined;

  if (booting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Hammer className="size-9 animate-pulse text-primary" />
        <p className="text-lg font-semibold tracking-tight text-foreground">PROJECT FORGE</p>
        <p className="text-sm text-muted-foreground">Menyiapkan ruang kerja…</p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <Toaster position="top-right" richColors closeButton theme={theme} offset={84} />
      <input
        ref={zipInput}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importZip(f);
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          zipCancel.current = false;
          void importFolder(files);
        }}
      />
      <input
        ref={jsonInput}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importJson(f);
        }}
      />

      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-card/70 px-2 py-2 backdrop-blur sm:px-3">
        <button
          className="btn-forge btn-ghost-forge md:hidden"
          aria-label="Alihkan penjelajah file"
          onClick={() => setSidebarOpen((s) => !s)}
        >
          <Menu className="size-4" />
        </button>
        <div className="mr-2 flex items-center gap-2">
          <Hammer className="size-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">PROJECT FORGE</span>
        </div>
        <div className="toolbar-stack flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:flex-wrap">
          <button className="btn-forge btn-ghost-forge" onClick={() => setDialog({ kind: "newProject" })}>
            <FilePlus2 className="size-4" /> <span className="hidden sm:inline">Baru</span>
          </button>
          {engine.meta && (
            <>
              <button className="btn-forge btn-ghost-forge" aria-label="Simpan" title="Simpan" onClick={() => void saveNow()}>
                <Save className="size-4" /> <span className="hidden sm:inline">Simpan</span>
              </button>
              <button className="btn-forge btn-ghost-forge" aria-label="Impor ZIP" title="Impor ZIP" onClick={() => zipInput.current?.click()}>
                <Upload className="size-4" /> <span className="hidden sm:inline">Impor</span>
              </button>
              <button className="btn-forge btn-ghost-forge" aria-label="Impor folder" title="Impor folder dari perangkat" onClick={() => folderInput.current?.click()}>
                <FolderInput className="size-4" /> <span className="hidden sm:inline">Folder</span>
              </button>
              <button className="btn-forge btn-ghost-forge" aria-label="Ekspor ZIP" title="Ekspor ZIP" onClick={() => void exportZip()}>
                <Package className="size-4" /> <span className="hidden sm:inline">ZIP</span>
              </button>
              <button className="btn-forge btn-ghost-forge" aria-label="Isi semua file" title="Isi semua file" onClick={() => setFillOpen(true)}>
                <Wand2 className="size-4" /> <span className="hidden sm:inline">Isi semua</span>
              </button>
              <button className="btn-forge btn-ghost-forge" onClick={() => setTermuxOpen(true)} aria-label="Database Termux" title="Database Termux">
                <Database className="size-4" /> <span className="hidden sm:inline">Termux</span>
              </button>
              <button className="btn-forge btn-ghost-forge" onClick={() => setApprovalOpen(true)} aria-label="Kirim dengan persetujuan Gmail" title="Kirim ke web lain (persetujuan Gmail)">
                <Mail className="size-4" /> <span className="hidden sm:inline">Gmail</span>
              </button>
              <button className="btn-forge btn-ghost-forge" onClick={() => setShareOpen(true)} aria-label="Kirim P2P">
                <Radio className="size-4" /> <span className="hidden sm:inline">P2P</span>
              </button>
              <button className="btn-forge btn-ghost-forge text-primary" onClick={() => setPreviewOpen(true)} aria-label="Preview" title="Preview interaktif (sandbox)">
                <Eye className="size-4" /> <span className="hidden sm:inline">Preview</span>
              </button>

              <button
                className="btn-forge btn-ghost-forge"
                onClick={() => engine.undo()}
                disabled={!engine.canUndo()}
                aria-label="Urungkan"
              >
                <Undo2 className="size-4" />
              </button>
              <button
                className="btn-forge btn-ghost-forge"
                onClick={() => engine.redo()}
                disabled={!engine.canRedo()}
                aria-label="Ulangi"
              >
                <Redo2 className="size-4" />
              </button>
            </>
          )}
          <button className="btn-forge btn-ghost-forge" onClick={() => setPaletteOpen(true)} aria-label="Palet perintah">
            <CommandIcon className="size-4" /> <span className="hidden lg:inline">Ctrl+K</span>
          </button>
          <button className="btn-forge btn-ghost-forge" onClick={toggleTheme} aria-label="Ganti tema">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
        <SaveBadge />
      </header>

      <FillAllDialog open={fillOpen} onClose={() => setFillOpen(false)} notify={notify} />
      <TermuxDialog open={termuxOpen} onClose={() => setTermuxOpen(false)} notify={notify} beforeSend={async () => { for (const id of dirty) flushBuffer(id); await engine.flush(); }} />
      <ApprovalDialog open={approvalOpen} onClose={() => setApprovalOpen(false)} notify={notify} beforeSend={async () => { for (const id of dirty) flushBuffer(id); await engine.flush(); }} />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} notify={notify} beforeSend={async () => { for (const id of dirty) flushBuffer(id); await engine.flush(); }} />
      <PreviewPanel
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        beforeOpen={() => { for (const id of dirty) flushBuffer(id); }}
        preferPath={activeTab ? engine.pathOf(activeTab) : null}
      />



      {!engine.meta ? (
        <Welcome
          onBlank={() => void createProject("My Project", false)}
          onLibrary={() => setLibraryOpen(true)}
          onStructure={() => setDialog({ kind: "structure" })}
        />
      ) : (
        <div className="relative flex min-h-0 flex-1">
          {/* Sidebar */}
          <aside
            className={cn(
              "absolute inset-y-0 left-0 z-30 flex w-[min(85vw,20rem)] flex-col border-r border-border bg-card transition-transform duration-200 md:static md:w-72 md:translate-x-0",
              sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
            )}
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <button
                className="truncate text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                onClick={() => setDialog({ kind: "renameProject" })}
                title="Ganti nama proyek"
              >
                {engine.meta.name}
              </button>
              <div className="ml-auto flex gap-1">
                <button
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="File baru"
                  onClick={() => setDialog({ kind: "newFile", parentId: folderContext(selected) })}
                >
                  <FilePlus2 className="size-4" />
                </button>
                <button
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Folder baru"
                  onClick={() => setDialog({ kind: "newFolder", parentId: folderContext(selected) })}
                >
                  <FolderPlus className="size-4" />
                </button>
              </div>
            </div>
            <div className="border-b border-border px-2 py-2">
              <div className="flex items-center gap-2 rounded-md bg-muted px-2">
                <Search className="size-3.5 text-muted-foreground" />
                <input
                  ref={searchInput}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Cari file…"
                  aria-label="Cari file"
                  className="w-full bg-transparent py-1.5 text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <FileExplorer
                activeId={selected}
                onOpenFile={openFile}
                onSelect={setSelected}
                onContext={(node, x, y) => setMenu({ node, x, y })}
                expanded={expanded}
                setExpanded={setExpanded}
                filter={filter}
              />
            </div>
            <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              File: {stats.files} · Folder: {stats.folders} · {formatBytes(stats.totalSize)}
            </div>
          </aside>
          {sidebarOpen && (
            <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}

          {/* Editor area */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card/50 px-1">
              {tabs.map((id) => {
                const node = engine.get(id);
                if (!node) return null;
                return (
                  <div
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "group flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 py-2 text-xs transition",
                      activeTab === id
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="max-w-[10rem] truncate">{node.name}</span>
                    <span className={cn("text-[10px]", dirty.has(id) ? "text-amber-400" : "text-emerald-400")}>
                      {dirty.has(id) ? "●" : "✓"}
                    </span>
                    <button
                      aria-label={`Tutup ${node.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(id);
                      }}
                      className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}
              {tabs.length > 1 && (
                <button
                  className="ml-auto shrink-0 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    tabs.forEach((id) => dirty.has(id) && flushBuffer(id));
                    setTabs([]);
                    setActiveTab(null);
                  }}
                >
                  Tutup semua
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1">
              {activeNode && activeTab && !isBinaryContent(buffers[activeTab] ?? activeNode.content ?? "") ? (
                <EditorPane
                  path={engine.pathOf(activeTab)}
                  value={buffers[activeTab] ?? activeNode.content ?? ""}
                  theme={theme}
                  onChange={(v) => onEdit(activeTab, v)}
                  onSave={() => void saveNow()}
                />
              ) : activeNode && isBinaryContent(activeNode.content ?? "") ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center text-sm text-muted-foreground">
                  <p>File biner tidak dapat diedit sebagai teks.</p>
                  <button className="btn-forge btn-primary-forge" onClick={() => downloadNode(activeNode)}>Unduh file</button>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <Hammer className="size-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Buka file dari penjelajah, atau buat file baru untuk mulai mengedit.
                  </p>
                  <button className="btn-forge btn-primary-forge md:hidden" onClick={() => setSidebarOpen(true)}>
                    Buka penjelajah
                  </button>
                </div>
              )}
            </div>
            {activeNode && activeTab && !isBinaryContent(activeNode.content ?? "") && (
              <AssistBar
                path={engine.pathOf(activeTab)}
                content={buffers[activeTab] ?? activeNode.content ?? ""}
                onReplace={(next) => onEdit(activeTab, next)}
                notify={notify}
              />
            )}

          </main>
        </div>
      )}

      {/* Status bar */}
      <footer className="flex items-center gap-3 border-t border-border bg-card/70 px-3 py-1.5 text-[11px] text-muted-foreground">
        <SaveBadge />
        {engine.meta && (
          <>
            <span>File: {stats.files}</span>
            <span>Folder: {stats.folders}</span>
            <span>Ukuran: {formatBytes(stats.totalSize)}</span>
          </>
        )}
        <span className="ml-auto hidden sm:inline">PROYEK ANDA. STRUKTUR ANDA. ATURAN ANDA.</span>
      </footer>

      {/* Context menu */}
      {menu && (
        <ContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onAction={(action) => {
            const node = menu.node;
            setMenu(null);
            try {
              switch (action) {
                case "open":
                  if (node?.type === "file") openFile(node);
                  else if (node) setExpanded(new Set(expanded).add(node.id));
                  break;
                case "newFile":
                  setDialog({ kind: "newFile", parentId: node ? folderContext(node.id) : null });
                  break;
                case "newFolder":
                  setDialog({ kind: "newFolder", parentId: node ? folderContext(node.id) : null });
                  break;
                case "rename":
                  if (node) setDialog({ kind: "rename", id: node.id });
                  break;
                case "duplicate":
                  if (node) {
                    engine.duplicate(node.id);
                    notify("success", "Diduplikasi");
                  }
                  break;
                case "move":
                  if (node) setDialog({ kind: "move", id: node.id });
                  break;
                case "download":
                  if (node) downloadNode(node);
                  break;
                case "copyPath":
                  if (node) {
                    void navigator.clipboard?.writeText(engine.pathOf(node.id));
                    notify("success", "Jalur disalin");
                  }
                  break;
                case "delete":
                  if (node) setDialog({ kind: "delete", id: node.id });
                  break;
              }
            } catch (e) {
              notify("error", (e as Error).message);
            }
          }}
        />
      )}

      {/* ZIP progress */}
      <Modal open={!!zip} title={zip?.label ?? ""} onClose={() => (zipCancel.current = true)}>
        {zip && (
          <div>
            <p className="text-xs text-muted-foreground">
              File: {zip.p.files.toLocaleString()} · Folder: {zip.p.folders.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Diproses: {zip.p.processed.toLocaleString()} / {Math.max(zip.p.total, 1).toLocaleString()}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.min(100, (zip.p.processed / Math.max(zip.p.total, 1)) * 100)}%` }}
              />
            </div>
            <Actions>
              <button className="btn-forge btn-ghost-forge" onClick={() => (zipCancel.current = true)}>
                Batal
              </button>
            </Actions>
          </div>
        )}
      </Modal>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ProjectLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onOpenProject={async (id) => {
          try {
            await engine.openProject(id);
            setTabs([]);
            setActiveTab(null);
            setBuffers({});
            setDirty(new Set());
            setExpanded(new Set());
            setLibraryOpen(false);
            notify("success", "Proyek dibuka");
          } catch (e) {
            notify("error", (e as Error).message);
          }
        }}
        onExport={(id) => void exportJson(id)}
        notify={notify}
      />

      <DialogHost
        dialog={dialog}
        close={() => setDialog(null)}
        notify={notify}
        onCreateProject={createProject}
        onImportJson={() => jsonInput.current?.click()}
        afterDelete={(id) => {
          setTabs((t) => t.filter((x) => x !== id));
        }}
      />
    </div>
  );
}

function SaveBadge() {
  useEngine();
  const state = engine.saveState;
  if (!engine.meta) return null;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] transition",
        state === "saving" && "bg-amber-500/15 text-amber-400",
        state === "saved" && "bg-emerald-500/15 text-emerald-400",
        state === "error" && "bg-destructive/15 text-destructive",
        state === "idle" && "text-muted-foreground",
      )}
    >
      {state === "saving" ? "Menyimpan…" : state === "error" ? "Gagal menyimpan — mencoba lagi" : "✓ Tersimpan secara lokal"}
    </span>
  );
}

function Welcome({
  onBlank,
  onLibrary,
  onStructure,
}: {
  onBlank: () => void;
  onLibrary: () => void;
  onStructure: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="glass-panel w-full max-w-lg rounded-2xl p-8 text-center animate-pop">
        <Hammer className="mx-auto size-8 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">PROJECT FORGE</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Buat proyek Anda. Tanpa akun, tanpa pendaftaran — semuanya tetap ada di perangkat ini.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button className="btn-forge btn-primary-forge" onClick={onBlank}>
            Buat Proyek Kosong
          </button>
          <button className="btn-forge btn-ghost-forge" onClick={onLibrary}>
            Buka Pustaka Proyek
          </button>
          <button className="btn-forge btn-ghost-forge" onClick={onStructure}>
            Buat Dari Struktur
          </button>
        </div>
      </div>
    </div>
  );
}

const MENU_ITEMS: { id: string; label: string; nodeOnly?: boolean; danger?: boolean }[] = [
  { id: "open", label: "Buka", nodeOnly: true },
  { id: "newFile", label: "File Baru" },
  { id: "newFolder", label: "Folder Baru" },
  { id: "rename", label: "Ganti Nama", nodeOnly: true },
  { id: "duplicate", label: "Duplikasi", nodeOnly: true },
  { id: "move", label: "Pindahkan", nodeOnly: true },
  { id: "download", label: "Unduh", nodeOnly: true },
  { id: "copyPath", label: "Salin Jalur", nodeOnly: true },
  { id: "delete", label: "Hapus", nodeOnly: true, danger: true },
];

function ContextMenu({
  menu,
  onClose,
  onAction,
}: {
  menu: { node: ProjectNode | null; x: number; y: number };
  onClose: () => void;
  onAction: (action: string) => void;
}) {
  const x = Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 400) - 190);
  const y = Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 600) - 340);
  return (
    <div
      className="glass-panel fixed z-[70] w-44 overflow-hidden rounded-lg py-1 shadow-2xl animate-pop"
      style={{ left: Math.max(8, x), top: Math.max(8, y) }}
      onClick={(e) => e.stopPropagation()}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {MENU_ITEMS.filter((i) => !i.nodeOnly || menu.node).map((item) => (
        <button
          key={item.id}
          role="menuitem"
          onClick={() => onAction(item.id)}
          className={cn(
            "block w-full px-3 py-2 text-left text-xs transition hover:bg-muted",
            item.danger ? "text-destructive" : "text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
      <button
        className="block w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
        onClick={onClose}
      >
        Batal
      </button>
    </div>
  );
}

function DialogHost({
  dialog,
  close,
  notify,
  onCreateProject,
  afterDelete,
}: {
  dialog: Dialog;
  close: () => void;
  notify: (t: "success" | "error" | "info", m: string) => void;
  onCreateProject: (name: string, example: boolean) => void;
  onImportJson: () => void;
  afterDelete: (id: string) => void;
}) {
  useEngine();
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [example, setExample] = useState(false);
  const [structure, setStructure] = useState("");

  useEffect(() => {
    setError(null);
    if (!dialog) return;
    if (dialog.kind === "newProject") {
      setName("My Project");
      setExample(false);
    } else if (dialog.kind === "newFile" || dialog.kind === "newFolder") {
      setName("");
      setParent(dialog.parentId ?? "");
    } else if (dialog.kind === "rename") {
      setName(engine.get(dialog.id)?.name ?? "");
    } else if (dialog.kind === "renameProject") {
      setName(engine.meta?.name ?? "");
    } else if (dialog.kind === "move") {
      setParent(engine.get(dialog.id)?.parentId ?? "");
    } else if (dialog.kind === "structure") {
      setStructure("");
    }
  }, [dialog]);

  if (!dialog) return null;
  const folders = engine.meta ? engine.folderOptions() : [{ id: null, label: "Root" }];

  const run = (fn: () => void) => {
    try {
      fn();
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (dialog.kind === "newProject")
    return (
      <Modal open title="Buat Proyek Baru" onClose={close}>
        <Field label="Nama Proyek">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="my-project" />
        </Field>
        <fieldset className="mt-2 space-y-2 text-sm">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pilih titik awal
          </legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!example} onChange={() => setExample(false)} /> Proyek Kosong
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={example} onChange={() => setExample(true)} /> Proyek Contoh
          </label>
        </fieldset>
        <ErrorText>{error}</ErrorText>
        <Actions>
          <button className="btn-forge btn-ghost-forge" onClick={close}>
            Batal
          </button>
          <button
            className="btn-forge btn-primary-forge"
            onClick={() =>
              run(() => {
                if (!name.trim()) throw new Error("Nama proyek tidak boleh kosong.");
                onCreateProject(name, example);
              })
            }
          >
            Buat Proyek
          </button>
        </Actions>
      </Modal>
    );

  if (dialog.kind === "newFile" || dialog.kind === "newFolder") {
    const isFile = dialog.kind === "newFile";
    return (
      <Modal open title={isFile ? "File Baru" : "Folder Baru"} onClose={close}>
        <Field label="Nama">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isFile ? "index.html" : "assets"}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                run(() => engine.createNode(parent || null, name, isFile ? "file" : "folder"));
            }}
          />
        </Field>
        <Field label={isFile ? "Lokasi" : "Induk"}>
          <Select value={parent} onChange={(e) => setParent(e.target.value)}>
            {folders.map((f) => (
              <option key={f.id ?? "root"} value={f.id ?? ""}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorText>{error}</ErrorText>
        <Actions>
          <button className="btn-forge btn-ghost-forge" onClick={close}>
            Batal
          </button>
          <button
            className="btn-forge btn-primary-forge"
            onClick={() => run(() => engine.createNode(parent || null, name, isFile ? "file" : "folder"))}
          >
            Buat
          </button>
        </Actions>
      </Modal>
    );
  }

  if (dialog.kind === "rename" || dialog.kind === "renameProject") {
    const isProject = dialog.kind === "renameProject";
    return (
      <Modal open title={isProject ? "Ganti Nama Proyek" : "Ganti Nama"} onClose={close}>
        <Field label="Nama">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                run(() =>
                  isProject
                    ? void engine.renameProject(name)
                    : engine.rename((dialog as { id: string }).id, name),
                );
            }}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Actions>
          <button className="btn-forge btn-ghost-forge" onClick={close}>
            Batal
          </button>
          <button
            className="btn-forge btn-primary-forge"
            onClick={() =>
              run(() => {
                if (!name.trim()) throw new Error("Nama tidak boleh kosong.");
                if (isProject) void engine.renameProject(name);
                else engine.rename((dialog as { id: string }).id, name);
              })
            }
          >
            Ganti Nama
          </button>
        </Actions>
      </Modal>
    );
  }

  if (dialog.kind === "move")
    return (
      <Modal open title="Pindahkan Item" onClose={close}>
        <Field label="Folder tujuan">
          <Select value={parent} onChange={(e) => setParent(e.target.value)}>
            {folders.map((f) => (
              <option key={f.id ?? "root"} value={f.id ?? ""}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorText>{error}</ErrorText>
        <Actions>
          <button className="btn-forge btn-ghost-forge" onClick={close}>
            Batal
          </button>
          <button
            className="btn-forge btn-primary-forge"
            onClick={() => run(() => engine.move(dialog.id, parent || null))}
          >
            Pindahkan
          </button>
        </Actions>
      </Modal>
    );

  if (dialog.kind === "delete") {
    const node = engine.get(dialog.id);
    return (
      <Modal open title={`Hapus "${node?.name ?? ""}"?`} onClose={close}>
        <p className="text-sm text-muted-foreground">
          {node?.type === "folder"
            ? "Folder ini beserta isinya akan dihapus."
            : "File ini akan dihapus."}{" "}
          Anda dapat mengurungkan ini setelahnya.
        </p>
        <Actions>
          <button className="btn-forge btn-ghost-forge" onClick={close}>
            Batal
          </button>
          <button
            className="btn-forge btn-danger-forge"
            onClick={() =>
              run(() => {
                engine.remove(dialog.id);
                afterDelete(dialog.id);
                toast.success(node?.type === "folder" ? "Folder dihapus" : "File dihapus", {
                  action: { label: "Urungkan", onClick: () => engine.undo() },
                });
              })
            }
          >
            Hapus
          </button>
        </Actions>
      </Modal>
    );
  }

  if (dialog.kind === "structure")
    return (
      <Modal open title="Buat Dari Struktur" onClose={close} wide>
        <p className="mb-3 text-xs text-muted-foreground">
          Tempel struktur pohon. Contoh /Nama sebagai proyek, |-/folder sebagai folder dan |-/file.js sebagai file. Catatan dalam tanda kurung tidak menjadi nama.
        </p>
        <textarea
          value={structure}
          onChange={(e) => setStructure(e.target.value)}
          rows={12}
          spellCheck={false}
          aria-label="Struktur proyek"
          className="input-forge w-full font-mono text-xs"
          placeholder={"/Nama\n       |-/folder (catatan)\n       |-/file.js (script)"}
        />
        <ErrorText>{error}</ErrorText>
        <Actions>
          <button className="btn-forge btn-ghost-forge" onClick={close}>
            Batal
          </button>
          <button
            className="btn-forge btn-primary-forge"
            onClick={async () => {
              try {
                const parsed = parseStructure(structure);
                if (parsed.errors.length) throw new Error(`Baris ${parsed.errors[0]?.line}: ${parsed.errors[0]?.message}`);
                const items = stripRoot(parsed.items, parsed.rootName);
                if (!items.length) throw new Error("Tidak ada yang bisa dibuat dari struktur ini.");
                validatePaths(items);
                if (!engine.meta) await engine.createProject(parsed.rootName ?? "My Project");
                engine.applyPaths(items);
                await engine.flush();
                notify("success", `Membuat ${items.length} item`);
                close();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Buat
          </button>
        </Actions>
      </Modal>
    );

  return null;
}
