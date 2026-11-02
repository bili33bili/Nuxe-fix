import { useEffect, useState } from "react";
import { Copy, Download, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { engine } from "@/engine/projectEngine";
import { listProjects, loadNodes } from "@/storage/db";
import { formatBytes, type ProjectMeta } from "@/engine/types";
import { Modal } from "./Dialogs";

interface Row extends ProjectMeta {
  files: number;
  folders: number;
  size: number;
}

export function ProjectLibrary({
  open,
  onClose,
  onOpenProject,
  onExport,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  onOpenProject: (id: string) => void;
  onExport: (id: string) => void;
  notify: (type: "success" | "error", msg: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const metas = await listProjects();
      const out: Row[] = [];
      for (const m of metas) {
        const nodes = m.id === engine.meta?.id ? [...engine.nodes.values()] : await loadNodes(m.id);
        out.push({
          ...m,
          files: nodes.filter((n) => n.type === "file").length,
          folders: nodes.filter((n) => n.type === "folder").length,
          size: nodes.reduce((a, n) => a + (n.size ?? 0), 0),
        });
      }
      setRows(out);
    } catch (e) {
      notify("error", (e as Error).message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} title="Pustaka Proyek" onClose={onClose} wide>
      {loading && <p className="text-sm text-muted-foreground">Memuat proyek…</p>}
      {!loading && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Belum ada proyek tersimpan. Buat satu untuk memulai.
        </p>
      )}
      <ul className="max-h-[60vh] space-y-2 overflow-auto pr-1">
        {rows.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-border bg-card/60 p-3 transition hover:border-primary/40"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {p.name}
                  {engine.meta?.id === p.id && (
                    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                      terbuka
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.files} berkas · {p.folders} folder · {formatBytes(p.size)} ·{" "}
                  {new Date(p.updatedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1">
                <IconBtn label="Buka" onClick={() => onOpenProject(p.id)}>
                  <FolderOpen className="size-4" />
                </IconBtn>
                <IconBtn
                  label="Ganti nama"
                  onClick={async () => {
                    const name = window.prompt("Nama proyek", p.name);
                    if (!name?.trim()) return;
                    await engine.renameProjectById(p.id, name.trim());
                    notify("success", "Proyek diganti nama");
                    void refresh();
                  }}
                >
                  <Pencil className="size-4" />
                </IconBtn>
                <IconBtn
                  label="Gandakan"
                  onClick={async () => {
                    try {
                      await engine.duplicateProject(p.id);
                      notify("success", "Proyek digandakan");
                      void refresh();
                    } catch (e) {
                      notify("error", (e as Error).message);
                    }
                  }}
                >
                  <Copy className="size-4" />
                </IconBtn>
                <IconBtn label="Ekspor JSON" onClick={() => onExport(p.id)}>
                  <Download className="size-4" />
                </IconBtn>
                <IconBtn
                  label="Hapus"
                  danger
                  onClick={async () => {
                    if (!window.confirm(`Hapus proyek "${p.name}"? Tindakan ini tidak dapat dibatalkan.`))
                      return;
                    await engine.deleteProjectById(p.id);
                    notify("success", "Proyek dihapus");
                    void refresh();
                  }}
                >
                  <Trash2 className="size-4" />
                </IconBtn>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-md p-2 text-muted-foreground transition hover:bg-muted active:scale-95 ${
        danger ? "hover:text-destructive" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
