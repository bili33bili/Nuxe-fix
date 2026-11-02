import { transform } from "sucrase";
import { isBinaryContent } from "@/lib/zipService";

const EXTS = ["", ".js", ".mjs", ".ts", ".tsx", ".jsx", "/index.js", "/index.ts", "/index.tsx", "/index.jsx"];

function dirOf(p: string) {
  return p.split("/").slice(0, -1);
}

export function resolveRel(fromFile: string, ref: string): string {
  const base = ref.startsWith("/") ? [] : dirOf(fromFile);
  for (const part of ref.split(/[?#]/)[0]!.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base.join("/");
}

const toData = (code: string, mime = "text/javascript") =>
  `data:${mime};charset=utf-8,${encodeURIComponent(code)}`;

/** Transpiles TS/JSX and rewrites imports so project files work as ES modules inside the sandbox. */
export function compileModule(path: string, files: Map<string, string>, stack = new Set<string>()): string {
  const src = files.get(path) ?? "";
  if (/\.css$/i.test(path)) {
    return toData(`const s=document.createElement('style');s.textContent=${JSON.stringify(src)};document.head.appendChild(s);export default ${JSON.stringify(src)};`);
  }
  if (/\.json$/i.test(path)) return toData(`export default ${src || "null"};`);
  if (isBinaryContent(src)) return toData(`export default ${JSON.stringify(path)};`);
  stack.add(path);
  const code = rewriteImports(transpile(path, src), path, files, stack);
  stack.delete(path);
  return toData(code);
}

export function transpile(path: string, src: string): string {
  const ts = /\.(ts|tsx|mts)$/i.test(path);
  const jsx = /\.(tsx|jsx)$/i.test(path) || /<[A-Z][\w.]*[\s/>]/.test(src);
  if (!ts && !jsx) return src;
  try {
    return transform(src, {
      transforms: [...(ts ? (["typescript"] as const) : []), ...(jsx ? (["jsx"] as const) : [])],
      jsxRuntime: "automatic",
      production: true,
      filePath: path,
    }).code;
  } catch (e) {
    return `throw new Error(${JSON.stringify(`Gagal kompilasi ${path}: ${(e as Error).message}`)});`;
  }
}

export function rewriteImports(code: string, from: string, files: Map<string, string>, stack: Set<string>): string {
  return code.replace(
    /(\bimport\s*\(\s*|\bfrom\s*|\bimport\s+)(['"])([^'"\n]+)\2/g,
    (m, pre, q, spec: string) => {
      if (/^(https?:|data:|blob:)/.test(spec)) return m;
      if (spec.startsWith(".") || spec.startsWith("/")) {
        const base = resolveRel(from, spec);
        const hit = EXTS.map((e) => base + e).find((p) => files.has(p));
        if (!hit || stack.has(hit)) return m;
        return `${pre}${q}${compileModule(hit, files, stack)}${q}`;
      }
      return `${pre}${q}https://esm.sh/${spec}${q}`;
    },
  );
}

const esc = (s: string) => s.replace(/<\/script/gi, "<\\/script");

/** Builds a runner page for a standalone script file (no HTML needed). */
export function buildRunner(path: string, files: Map<string, string>): string | null {
  const src = files.get(path) ?? "";
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const shell = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font:13px/1.5 ui-monospace,monospace;background:#0f1115;color:#e6e6e6}
header{padding:8px 12px;background:#1a1d24;color:#9aa}#out{padding:12px;white-space:pre-wrap}
.err{color:#ff6b6b}.ok{color:#5be08f}</style></head><body><header>▶ ${path}</header><div id="out"></div>
<div id="root"></div>
<script>(function(){var o=document.getElementById('out');function w(c,a){var d=document.createElement('div');d.className=c;d.textContent=a.map(function(x){try{return typeof x==='string'?x:JSON.stringify(x)}catch(e){return String(x)}}).join(' ');o.appendChild(d);}
['log','info','warn','error'].forEach(function(k){var f=console[k];console[k]=function(){w(k==='error'?'err':'',[].slice.call(arguments));f.apply(console,arguments)}});
window.__out=w;window.addEventListener('error',function(e){w('err',['Error: '+e.message])});
window.addEventListener('unhandledrejection',function(e){w('err',['Error: '+e.reason])});})();</script>${body}</body></html>`;

  if (["js", "mjs", "ts", "tsx", "jsx", "mts"].includes(ext)) {
    const code = rewriteImports(transpile(path, src), path, files, new Set([path]));
    return shell(`<script type="module">${esc(code)}\n;window.__out('ok',['✓ Selesai']);</script>`);
  }
  if (ext === "py") {
    return shell(`<script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"></script>
<script>(async function(){__out('',['Memuat Python (Pyodide)...']);try{var py=await loadPyodide();
py.setStdout({batched:function(s){__out('',[s])}});py.setStderr({batched:function(s){__out('err',[s])}});
var code=${JSON.stringify(src)};try{await py.loadPackagesFromImports(code)}catch(e){}
await py.runPythonAsync(code);__out('ok',['✓ Selesai'])}catch(e){__out('err',[String(e)])}})();</script>`);
  }
  if (ext === "json") {
    try {
      JSON.parse(src);
      return shell(`<script>__out('ok',['✓ JSON valid']);__out('',[${JSON.stringify(src)}])</script>`);
    } catch (e) {
      return shell(`<script>__out('err',[${JSON.stringify("JSON error: " + (e as Error).message)}])</script>`);
    }
  }
  if (ext === "md" || ext === "txt" || ext === "css") {
    return shell(`<script>__out('',[${JSON.stringify(src)}])</script>`);
  }
  if (ext === "svg") return src;
  return null;
}

export const RUNNABLE = /\.(js|mjs|ts|tsx|jsx|mts|py|json|md|txt|svg)$/i;
