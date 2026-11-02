import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, KeyRound, Loader2, Wand2, X } from "lucide-react";
import { engine } from "@/engine/projectEngine";
import type { ProjectNode } from "@/engine/types";
import { hasKey, generateWithKey, loadByok, saveByok, type ByokSettings } from "@/lib/byok";
import { lintScript, scaffoldFor, type LintIssue } from "@/lib/localScaffold";

interface FileResult {
  path: string;
  source: "provider" | "local" | "skipped" | "failed";
  message?: string;
  issues: LintIssue[];
}

function allFiles(): { id: string; path: string; node: ProjectNode }[] {
  const out: { id: string; path: string; node: ProjectNode }[] = [];
  const walk = (parentId: string | null) => {
    for (const n of engine.childrenOf(parentId)) {
      if (n.type === "folder") walk(n.id);
      else out.push({ id: n.id, path: engine.pathOf(n.id), node: n });
    }
  };
  walk(null);
  return out;
}

export function FillAllDialog({
  open,
  onClose,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  notify: (type: "success" | "error" | "info", message: string) => void;
}) {
  const [settings, setSettings] = useState<ByokSettings>(() => loadByok());
  const [prompt, setPrompt] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<FileResult[]>([]);
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) setSettings(loadByok());
  }, [open]);

  const keyed = hasKey(settings);
  const problems = useMemo(
    () => results.filter((r) => r.issues.some((i) => i.severity === "error")).length,
    [results],
  );

  if (!open) return null;

  async function run() {
    if (busy) return;
    const files = allFiles().filter((f) => (onlyEmpty ? !(f.node.content ?? "").trim() : true));
    if (!files.length) {
      notify("info", onlyEmpty ? "Tidak ada berkas kosong untuk diisi." : "Proyek ini belum memiliki berkas.");
      return;
    }
    saveByok(settings);
    cancelRef.current = false;
    abortRef.current = new AbortController();
    setBusy(true);
    setResults([]);
    setDone(0);
    setTotal(files.length);

    const collected: FileResult[] = [];
    for (const f of files) {
      if (cancelRef.current) break;
      const current = engine.get(f.id)?.content ?? "";
      let content = "";
      let source: FileResult["source"] = "local";
      let message: string | undefined;

      if (keyed) {
        try {
          content = await generateWithKey(
            settings,
            { path: f.path, content: current, ...(prompt.trim() ? { prompt: prompt.trim() } : {}) },
            abortRef.current.signal,
          );
          source = "provider";
        } catch (err) {
          content = scaffoldFor(f.path, prompt.trim() || undefined);
          source = "failed";
          message = err instanceof Error ? err.message : "Panggilan penyedia gagal — menggunakan pembuat sederhana sebagai gantinya.";
        }
      } else {
        content = scaffoldFor(f.path, prompt.trim() || undefined);
      }

      engine.setContent(f.id, content);
      collected.push({ path: f.path, source, ...(message ? { message } : {}), issues: lintScript(f.path, content) });
      setResults([...collected]);
      setDone(collected.length);
    }

    setBusy(false);
    abortRef.current = null;
    const filled = collected.length;
    if (cancelRef.current) notify("info", `Dihentikan setelah ${filled} berkas. Tidak ada perubahan lain.`);
    else notify("success", `${filled} berkas terisi${keyed ? "" : " dengan pembuat bawaan"}.`);
  }

  function stop() {
    cancelRef.current = true;
    abortRef.current?.abort();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="stack-in flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-xl sm:rounded-xl">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Wand2 className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Isi otomatis semua berkas</h2>
          <button className="ml-auto rounded p-1 hover:bg-muted" aria-label="Tutup" onClick={onClose}>
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-auto px-4 py-3 text-sm">
          <div className="stack-list space-y-2">
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="fa-prompt">
              Instruksi opsional (kosongkan agar sistem yang menentukan)
            </label>
            <input
              id="fa-prompt"
              className="input-forge stack-item"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="misalnya pustaka utilitas kecil, tanpa dependensi"
            />

            <div className="stack-item rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                <KeyRound className="size-3.5" />
                Kunci API Anda sendiri
                <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${keyed ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                  {keyed ? "kunci aktif" : "tanpa kunci — pembuat sederhana"}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="input-forge"
                  value={settings.baseUrl}
                  onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  aria-label="URL dasar penyedia"
                />
                <input
                  className="input-forge"
                  value={settings.model}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  placeholder="nama model"
                  aria-label="Model"
                />
              </div>
              <input
                className="input-forge mt-2"
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                placeholder="sk-... (hanya disimpan di browser ini)"
                aria-label="Kunci API"
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Nilai bawaan berasal dari .env proyek (VITE_AI_BASE_URL, VITE_AI_MODEL, VITE_AI_API_KEY). Tanpa kunci,
                setiap berkas mendapat templat awal dari pembuat bawaan dan diperiksa dari kesalahan ketik serta tanda kurung yang rusak.
              </p>
            </div>

            <label className="stack-item flex items-center gap-2 text-xs">
              <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
              Hanya isi berkas kosong (hapus centang untuk menimpa semuanya)
            </label>
          </div>

          {total > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {done} / {total} berkas
                </span>
                {problems > 0 && <span className="text-destructive">{problems} berkas perlu diperbaiki</span>}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          {results.length > 0 && (
            <ul className="stack-list space-y-1.5">
              {results.map((r) => (
                <li key={r.path} className="stack-item rounded-lg border border-border px-2.5 py-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {r.issues.some((i) => i.severity === "error") ? (
                      <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                    ) : (
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                    )}
                    <span className="truncate font-medium">{r.path}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {r.source === "provider" ? "API Anda" : r.source === "failed" ? "cadangan" : "pembuat"}
                    </span>
                  </div>
                  {r.message && <p className="mt-1 text-[11px] text-amber-400">{r.message}</p>}
                  {r.issues.map((i, k) => (
                    <p key={k} className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      {i.severity === "info" ? (
                        <Info className="mt-0.5 size-3 shrink-0" />
                      ) : (
                        <AlertTriangle className={`mt-0.5 size-3 shrink-0 ${i.severity === "error" ? "text-destructive" : "text-amber-400"}`} />
                      )}
                      <span>
                        {i.line ? <span className="text-foreground">Baris {i.line}: </span> : null}
                        {i.message}
                      </span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button className="btn-forge btn-ghost-forge" onClick={busy ? stop : onClose}>
            {busy ? "Hentikan" : "Tutup"}
          </button>
          <button className="btn-forge btn-primary-forge" onClick={() => void run()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            Isi semua berkas
          </button>
        </footer>
      </div>
    </div>
  );
}
