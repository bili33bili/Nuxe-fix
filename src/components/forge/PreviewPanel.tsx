import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, RotateCw, X, Eye } from "lucide-react";
import { engine } from "@/engine/projectEngine";
import { isBinaryContent } from "@/lib/zipService";
import { buildRunner, compileModule, rewriteImports, transpile, RUNNABLE } from "./previewRuntime";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", ico: "image/x-icon", bmp: "image/bmp", mp3: "audio/mpeg", wav: "audio/wav",
  ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", otf: "font/otf", json: "application/json", css: "text/css", js: "text/javascript",
};

function mimeOf(path: string) {
  return MIME[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
}

function resolve(fromFile: string, ref: string): string | null {
  if (!ref || /^(https?:|data:|blob:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref)) return null;
  const clean = ref.split(/[?#]/)[0] ?? "";
  if (!clean) return null;
  const base = clean.startsWith("/") ? [] : fromFile.split("/").slice(0, -1);
  for (const part of clean.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(decodeURIComponent(part));
  }
  return base.join("/");
}

/** Builds a self-contained HTML document: CSS, JS and assets are inlined so the sandbox needs no network. */
function buildDocument(entry: string, files: Map<string, string>): string {
  const html = files.get(entry) ?? "";
  const dataUrl = (path: string) => {
    const c = files.get(path);
    if (c === undefined) return null;
    if (isBinaryContent(c)) return `data:${mimeOf(path)};base64,${c.slice(c.indexOf(":") + 1)}`;
    return `data:${mimeOf(path)};charset=utf-8,${encodeURIComponent(c)}`;
  };
  const fixCss = (css: string, from: string) =>
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, _q, ref) => {
      const p = resolve(from, ref);
      const d = p && dataUrl(p);
      return d ? `url("${d}")` : m;
    });

  let out = html
    .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, (tag) => {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      const p = href && resolve(entry, href);
      const css = p ? files.get(p) : undefined;
      return css !== undefined && p ? `<style data-src="${p}">\n${fixCss(css, p)}\n</style>` : tag;
    })
    .replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a, src, b) => {
      const p = resolve(entry, src);
      const js = p ? files.get(p) : undefined;
      if (js === undefined || !p) return tag;
      const attrs = `${a}${b}`;
      if (/type=["']?module/i.test(attrs) || /\.(ts|tsx|jsx|mts)$/i.test(p) || /^\s*(import|export)\s/m.test(js)) {
        const clean = attrs.replace(/\btype=["'][^"']*["']/i, "");
        return `<script type="module"${clean} src="${compileModule(p, files)}"></script>`;
      }
      return `<script${attrs} data-src="${p}">\n${js.replace(/<\/script/gi, "<\\/script")}\n</script>`;
    })
    .replace(/<script\b([^>]*\btype=["']?(?:module|text\/babel|text\/typescript)["']?[^>]*)>([\s\S]*?)<\/script>/gi, (tag, a, body) => {
      if (/\bsrc=/i.test(a) || !body.trim()) return tag;
      const code = rewriteImports(transpile(entry.replace(/\.html?$/i, ".tsx"), body), entry, files, new Set());
      return `<script type="module">${code.replace(/<\/script/gi, "<\\/script")}</script>`;
    })
    .replace(/(<(?:img|audio|video|source|iframe|embed)\b[^>]*\bsrc=)(["'])([^"']+)\2/gi, (m, pre, q, ref) => {
      const p = resolve(entry, ref);
      const d = p && dataUrl(p);
      return d ? `${pre}${q}${d}${q}` : m;
    })
    .replace(/(<link\b[^>]*\bhref=)(["'])([^"']+)\2/gi, (m, pre, q, ref) => {
      const p = resolve(entry, ref);
      const d = p && dataUrl(p);
      return d ? `${pre}${q}${d}${q}` : m;
    })
    .replace(/(style=)(["'])([^"']*url\([^"']*)\2/gi, (_m, pre, q, css) => `${pre}${q}${fixCss(css, entry)}${q}`)
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_m, a, css) => `<style${a}>${fixCss(css, entry)}</style>`);

  // Bridge: links to other project pages and runtime errors are reported to the builder.
  const bridge = `<script>(function(){
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');
if(!h||/^(https?:|mailto:|tel:|javascript:|#|\\/\\/)/i.test(h)){if(/^https?:|^\\/\\//i.test(h)){e.preventDefault();window.open(h,'_blank');}return;}
e.preventDefault();parent.postMessage({forgePreview:'nav',href:h},'*');},true);
window.addEventListener('error',function(e){parent.postMessage({forgePreview:'error',message:String(e.message)+(e.lineno?' (baris '+e.lineno+')':'')},'*');});
window.addEventListener('unhandledrejection',function(e){parent.postMessage({forgePreview:'error',message:String(e.reason)},'*');});
})();</script>`;
  out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (h) => h + bridge) : bridge + out;
  return out;
}

export function PreviewPanel({ open, onClose, beforeOpen, preferPath }: {
  open: boolean;
  onClose: () => void;
  beforeOpen: () => void;
  preferPath: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [entry, setEntry] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [doc, setDoc] = useState("");
  const [nonce, setNonce] = useState(0);
  const [full, setFull] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const render = useCallback((target?: string | null) => {
    beforeOpen();
    const files = new Map(engine.fileList().map((f) => [f.path, f.content]));
    const htmls = [...files.keys()].filter((p) => /\.html?$/i.test(p)).sort();
    const runnable = preferPath && RUNNABLE.test(preferPath) && files.has(preferPath) ? preferPath : null;
    setPages(runnable && !htmls.includes(runnable) ? [runnable, ...htmls] : htmls);
    const pick =
      (target && files.has(target) ? target : null) ??
      (entry && files.has(entry) ? entry : null) ??
      runnable ??
      (preferPath && /\.html?$/i.test(preferPath) && files.has(preferPath) ? preferPath : null) ??
      htmls.find((p) => /(^|\/)index\.html?$/i.test(p)) ??
      htmls[0] ??
      null;
    setEntry(pick);
    setErrors([]);
    const built = !pick ? "" : /\.html?$/i.test(pick) ? buildDocument(pick, files)
      : buildRunner(pick, files) ?? `<pre style="padding:12px">Tipe file ${pick} tidak bisa dijalankan di browser (butuh server/compiler asli).</pre>`;
    setDoc(built);
    setNonce((n) => n + 1);
  }, [beforeOpen, entry, preferPath]);

  useEffect(() => {
    if (open) render(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMsg = (e: MessageEvent) => {
      // Accept preview bridge messages only from this sandbox iframe.
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as { forgePreview?: string; href?: string; message?: string };
      if (d?.forgePreview === "nav" && d.href && entry) {
        const p = resolve(entry, d.href);
        if (p && pages.includes(p)) render(p);
      } else if (d?.forgePreview === "error" && d.message) {
        setErrors((x) => [...x.slice(-4), d.message!]);
      }
    };
    const onFs = () => setFull(!!document.fullscreenElement);
    window.addEventListener("message", onMsg);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("message", onMsg);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [open, entry, pages, render]);

  const toggleFull = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el.requestFullscreen) await el.requestFullscreen();
      else setFull((f) => !f);
    } catch {
      setFull((f) => !f);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-2 backdrop-blur-sm sm:p-6">
      <div
        ref={wrapRef}
        className={full ? "fixed inset-0 z-50 flex flex-col bg-card" : "glass-panel flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-card"}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-2">
          <Eye className="size-4 text-primary" />
          <span className="text-sm font-semibold">Preview</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Sandbox · tidak dipublish</span>
          {pages.length > 1 && (
            <select
              className="ml-1 max-w-[45vw] truncate rounded-md border border-border bg-background px-2 py-1 text-xs"
              value={entry ?? ""}
              onChange={(e) => render(e.target.value)}
              aria-label="Pilih halaman"
            >
              {pages.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-forge btn-ghost-forge" onClick={() => render(entry)} aria-label="Refresh" title="Refresh">
              <RotateCw className="size-4" /> <span className="hidden sm:inline">Refresh</span>
            </button>
            <button className="btn-forge btn-ghost-forge" onClick={() => void toggleFull()} aria-label="Fullscreen" title="Fullscreen">
              {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              <span className="hidden sm:inline">{full ? "Keluar" : "Fullscreen"}</span>
            </button>
            <button className="btn-forge btn-ghost-forge" onClick={async () => { if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); setFull(false); onClose(); }} aria-label="Tutup preview">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 bg-white">
          {entry ? (
            <iframe
              ref={iframeRef}
              key={nonce}
              title="Preview proyek"
              srcDoc={doc}
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-card p-6 text-center text-sm text-muted-foreground">
              Belum ada file .html di proyek. Buat misalnya index.html untuk melihat preview.
            </div>
          )}
        </div>
        {errors.length > 0 && (
          <div className="max-h-28 shrink-0 overflow-auto border-t border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
            {errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
