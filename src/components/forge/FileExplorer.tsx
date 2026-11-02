import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  File as FileIcon,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Music,
} from "lucide-react";
import { engine } from "@/engine/projectEngine";
import type { ProjectNode } from "@/engine/types";
import { useEngine } from "@/hooks/useEngine";
import { cn } from "@/lib/utils";

export interface ExplorerRow {
  node: ProjectNode;
  depth: number;
}

const ROW_HEIGHT = 30;
const OVERSCAN = 12;

function iconFor(node: ProjectNode, open: boolean) {
  if (node.type === "folder")
    return open ? (
      <FolderOpen className="size-4 shrink-0 text-[color:var(--folder)]" />
    ) : (
      <Folder className="size-4 shrink-0 text-[color:var(--folder)]" />
    );
  const n = node.name.toLowerCase();
  if (/\.(png|jpe?g|gif|svg|webp|ico|bmp)$/.test(n))
    return <ImageIcon className="size-4 shrink-0 text-emerald-400" />;
  if (/\.(mp3|wav|ogg|m4a)$/.test(n)) return <Music className="size-4 shrink-0 text-pink-400" />;
  if (/\.json$/.test(n)) return <FileJson className="size-4 shrink-0 text-amber-400" />;
  if (/\.(md|txt|log)$/.test(n)) return <FileText className="size-4 shrink-0 text-slate-400" />;
  if (/\.(js|jsx|ts|tsx|py|java|cpp|c|cs|go|rs|rb|php|lua|html|css|scss|sh|yml|yaml|xml)$/.test(n))
    return <FileCode2 className="size-4 shrink-0 text-sky-400" />;
  return <FileIcon className="size-4 shrink-0 text-muted-foreground" />;
}

export interface FileExplorerHandle {
  expandAll: () => void;
  collapseAll: () => void;
}

interface Props {
  activeId: string | null;
  onOpenFile: (node: ProjectNode) => void;
  onSelect: (id: string | null) => void;
  onContext: (node: ProjectNode | null, x: number, y: number) => void;
  expanded: Set<string>;
  setExpanded: (s: Set<string>) => void;
  filter: string;
}

export function FileExplorer({
  activeId,
  onOpenFile,
  onSelect,
  onContext,
  expanded,
  setExpanded,
  filter,
}: Props) {
  useEngine();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null | "root">(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo(() => {
    const out: ExplorerRow[] = [];
    const q = filter.trim().toLowerCase();
    const walk = (parentId: string | null, depth: number) => {
      for (const node of engine.childrenOf(parentId)) {
        if (q) {
          const matches = node.name.toLowerCase().includes(q);
          if (node.type === "folder") {
            const before = out.length;
            out.push({ node, depth });
            walk(node.id, depth + 1);
            if (!matches && out.length === before + 1) out.pop();
          } else if (matches) {
            out.push({ node, depth });
          }
          continue;
        }
        out.push({ node, depth });
        if (node.type === "folder" && expanded.has(node.id)) walk(node.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, filter, engine.getVersion()]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
  const visible = rows.slice(start, end);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setExpanded(next);
    },
    [expanded, setExpanded],
  );

  const handleDrop = (targetId: string | null) => {
    if (!dragId) return;
    try {
      engine.move(dragId, targetId);
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent("forge:toast", {
          detail: { type: "error", message: (e as Error).message },
        }),
      );
    }
    setDragId(null);
    setDropId(null);
  };

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto overscroll-contain px-1 py-2"
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onContext(null, e.clientX, e.clientY);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDropId("root");
      }}
      onDrop={(e) => {
        e.preventDefault();
        handleDrop(null);
      }}
      role="tree"
      aria-label="Berkas proyek"
    >
      {rows.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          {filter ? "Tidak ada yang cocok." : "Proyek kosong — buat berkas atau folder."}
        </p>
      )}
      <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
        {visible.map(({ node, depth }, i) => {
          const isOpen = expanded.has(node.id);
          const isActive = activeId === node.id;
          return (
            <div
              key={node.id}
              role="treeitem"
              aria-selected={isActive}
              aria-expanded={node.type === "folder" ? isOpen : undefined}
              tabIndex={0}
              draggable
              onDragStart={() => setDragId(node.id)}
              onDragEnd={() => {
                setDragId(null);
                setDropId(null);
              }}
              onDragOver={(e) => {
                if (node.type === "folder") {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropId(node.id);
                }
              }}
              onDrop={(e) => {
                if (node.type === "folder") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDrop(node.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(node.id);
                onContext(node, e.clientX, e.clientY);
              }}
              onTouchStart={(e) => {
                const t = e.touches[0];
                if (!t) return;
                longPress.current = setTimeout(() => {
                  onSelect(node.id);
                  onContext(node, t.clientX, t.clientY);
                }, 500);
              }}
              onTouchEnd={() => longPress.current && clearTimeout(longPress.current)}
              onTouchMove={() => longPress.current && clearTimeout(longPress.current)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  node.type === "folder" ? toggle(node.id) : onOpenFile(node);
                }
              }}
              onClick={() => {
                onSelect(node.id);
                if (node.type === "folder") toggle(node.id);
                else onOpenFile(node);
              }}
              className={cn(
                "explorer-row absolute left-0 right-0 flex items-center gap-1.5 rounded-md pr-2 text-sm",
                isActive && "bg-[color:var(--row-active)] text-foreground",
                dropId === node.id && node.type === "folder" && "ring-1 ring-primary",
                dragId === node.id && "opacity-50",
              )}
              style={{
                top: (start + i) * ROW_HEIGHT,
                height: ROW_HEIGHT - 2,
                paddingLeft: 6 + depth * 14,
              }}
              title={engine.pathOf(node.id)}
            >
              {node.type === "folder" ? (
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-90",
                  )}
                />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              {iconFor(node, isOpen)}
              <span className="truncate">{node.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
