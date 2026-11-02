import { useEffect, useState } from "react";
import { Copy, Database, Download, Loader2, Upload, X } from "lucide-react";
import { engine } from "@/engine/projectEngine";

const KEY = "forge.termux.v1";

const SERVER_PY = `import http.server,json,os,re
R=os.path.expanduser("~/forge");os.makedirs(R,exist_ok=True)
T=os.environ.get("FORGE_KEY","")
def safe(n):return re.sub(r"[^A-Za-z0-9._ -]","_",n)[:80] or "proyek"
class H(http.server.BaseHTTPRequestHandler):
 def h(s,c=200,b=None):
  s.send_response(c)
  for k,v in [("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*"),("Access-Control-Allow-Methods","GET,POST,OPTIONS"),("Access-Control-Allow-Private-Network","true"),("Content-Type","application/json")]:s.send_header(k,v)
  s.end_headers()
  if b is not None:s.wfile.write(json.dumps(b).encode())
 def ok(s):
  if T and s.headers.get("Authorization")!="Bearer "+T:s.h(401,{"error":"Kunci salah"});return False
  return True
 def do_OPTIONS(s):s.h(204)
 def do_GET(s):
  if not s.ok():return
  p=s.path.strip("/").split("/")
  if p==["projects"]:return s.h(200,[f[:-5] for f in os.listdir(R) if f.endswith(".json")])
  if len(p)==2:
   f=os.path.join(R,safe(p[1])+".json")
   if os.path.exists(f):return s.h(200,json.load(open(f)))
  s.h(404,{"error":"Tidak ada"})
 def do_POST(s):
  if not s.ok():return
  d=json.loads(s.rfile.read(int(s.headers["Content-Length"])))
  n=safe(d.get("name","proyek"));json.dump(d,open(os.path.join(R,n+".json"),"w"))
  base=os.path.join(R,n)
  for f in d.get("folders",[]):os.makedirs(os.path.join(base,f.strip("/")),exist_ok=True)
  for f in d.get("files",[]):
   q=os.path.normpath(os.path.join(base,f["path"].lstrip("/")))
   if not q.startswith(base):continue
   os.makedirs(os.path.dirname(q),exist_ok=True);open(q,"w").write(f.get("content") or "")
  s.h(200,{"ok":True,"name":n})
print("Forge server: http://127.0.0.1:8765  folder:",R)
http.server.ThreadingHTTPServer(("0.0.0.0",8765),H).serve_forever()
`;

const INSTALL = `pkg install -y python && cat > ~/forge-server.py <<'EOF'\n${SERVER_PY}EOF\npython ~/forge-server.py`;

type P = { name: string; files: { path: string; content: string }[]; folders: string[] };

export function TermuxDialog({ open, onClose, notify, beforeSend }: {
  open: boolean; onClose: () => void;
  notify: (t: "success" | "error" | "info", m: string) => void;
  beforeSend?: () => Promise<void>;
}) {
  const [url, setUrl] = useState("http://127.0.0.1:8765");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) return;
    try { const s = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (s.url) setUrl(s.url); if (s.key) setKey(s.key); } catch { /* */ }
  }, [open]);
  if (!open) return null;

  const call = async (path: string, init?: RequestInit) => {
    localStorage.setItem(KEY, JSON.stringify({ url, key }));
    const res = await fetch(url.replace(/\/+$/, "") + path, {
      ...init, headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    }).catch(() => { throw new Error("Server Termux tidak terjangkau. Pastikan sudah dijalankan."); });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? `Gagal (${res.status})`);
    return j;
  };
  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); } catch (e) { notify("error", (e as Error).message); } finally { setBusy(false); } };

  const push = () => run(async () => {
    await beforeSend?.();
    const body = { name: engine.meta?.name ?? "proyek", files: engine.fileList(), folders: engine.folderList() };
    const r = await call("/projects", { method: "POST", body: JSON.stringify(body) });
    notify("success", `Tersimpan di Termux: ~/forge/${r.name}`);
  });
  const load = () => run(async () => setList(await call("/projects")));
  const pull = (n: string) => run(async () => {
    const p = (await call(`/projects/${encodeURIComponent(n)}`)) as P;
    await engine.flush();
    await engine.createProject(`${p.name} (Termux)`, [
      ...(p.folders ?? []).map((f) => ({ path: f.replace(/\/?$/, "/") })),
      ...(p.files ?? []).map((f) => ({ path: f.path, content: f.content })),
    ]);
    notify("success", `Dibuka ${p.files?.length ?? 0} berkas dari Termux.`);
    onClose();
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4" role="dialog" aria-modal="true" aria-label="Database Termux">
      <div className="max-h-[92vh] w-full max-w-md overflow-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg">
        <div className="mb-3 flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <h2 className="flex-1 font-semibold">Database Termux</h2>
          <button onClick={onClose} aria-label="Tutup"><X className="size-4" /></button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">1. Salin perintah, tempel di Termux, tekan Enter. Biarkan Termux tetap terbuka.</p>
        <button className="btn-forge btn-ghost-forge mb-4 w-full" onClick={() => { void navigator.clipboard.writeText(INSTALL); notify("success", "Perintah disalin. Tempel di Termux."); }}>
          <Copy className="size-4" /> Salin perintah Termux
        </button>
        <label className="mb-2 block text-xs text-muted-foreground">2. Alamat server
          <input className="input-forge mt-1" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="mb-4 block text-xs text-muted-foreground">Kunci (opsional, sama dengan FORGE_KEY)
          <input className="input-forge mt-1" type="password" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button className="btn-forge flex-1" disabled={busy} onClick={push}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Kirim</button>
          <button className="btn-forge btn-ghost-forge flex-1" disabled={busy} onClick={load}><Download className="size-4" /> Ambil</button>
        </div>
        {list && (
          <ul className="mt-3 space-y-1">
            {list.length === 0 && <li className="text-xs text-muted-foreground">Belum ada proyek di Termux.</li>}
            {list.map((n) => (
              <li key={n}><button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" disabled={busy} onClick={() => pull(n)}>{n}</button></li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">Berkas juga ditulis ke folder ~/forge di HP Anda. Proyek di browser tidak terhapus.</p>
      </div>
    </div>
  );
}
