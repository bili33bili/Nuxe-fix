import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Info, Loader2, Sparkles, Stethoscope, X } from "lucide-react";
import { assistFile } from "@/lib/ai.functions";
import { languageFor } from "./EditorPane";

interface Issue {
  severity: "error" | "warning" | "info";
  line: number | null;
  message: string;
}

export function AssistBar({
  path,
  content,
  onReplace,
  notify,
}: {
  path: string;
  content: string;
  onReplace: (next: string) => void;
  notify: (type: "success" | "error" | "info", message: string) => void;
}) {
  const run = useServerFn(assistFile);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<null | "generate" | "review">(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [summary, setSummary] = useState("");

  async function go(mode: "generate" | "review") {
    if (busy) return;
    setBusy(mode);
    try {
      const res = await run({
        data: { mode, path, language: languageFor(path), prompt: prompt.trim() || undefined, content },
      });
      if (res.mode === "generate") {
        if (!res.content.trim()) throw new Error("Hasil kosong.");
        onReplace(res.content);
        setIssues(null);
        setSummary("");
        notify("success", "Skrip terisi otomatis");
      } else {
        setIssues(res.issues);
        setSummary(res.summary);
        notify(res.issues.some((i) => i.severity === "error") ? "error" : "info", res.ok && !res.issues.length ? "Tidak ada masalah ditemukan" : "Periksa catatan di bawah");
      }
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Permintaan AI gagal.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-border bg-card/60">
      {(issues !== null || summary) && (
        <div className="max-h-40 overflow-auto border-b border-border px-3 py-2 text-xs">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
            <span className="font-medium text-foreground">Pemeriksaan skrip</span>
            <button
              className="ml-auto rounded p-0.5 hover:bg-muted"
              aria-label="Tutup ulasan"
              onClick={() => {
                setIssues(null);
                setSummary("");
              }}
            >
              <X className="size-3" />
            </button>
          </div>
          {summary && <p className="mb-1 text-muted-foreground">{summary}</p>}
          {issues?.length === 0 && (
            <p className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="size-3.5" /> Tampak baik.
            </p>
          )}
          <ul className="space-y-1">
            {issues?.map((i, k) => (
              <li key={k} className="flex items-start gap-1.5">
                {i.severity === "error" ? (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                ) : i.severity === "warning" ? (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                ) : (
                  <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">
                  {i.line ? <span className="text-foreground">Baris {i.line}: </span> : null}
                  {i.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void go("generate");
          }}
          placeholder="Perintah opsional — kosongkan agar sistem yang menentukan"
          aria-label="Perintah AI"
          className="input-forge min-w-[12rem] flex-1"
        />
        <button className="btn-forge btn-primary-forge" onClick={() => void go("generate")} disabled={busy !== null}>
          {busy === "generate" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Skrip otomatis
        </button>
        <button className="btn-forge btn-ghost-forge" onClick={() => void go("review")} disabled={busy !== null}>
          {busy === "review" ? <Loader2 className="size-4 animate-spin" /> : <Stethoscope className="size-4" />}
          Periksa
        </button>
      </div>
    </div>
  );
}
