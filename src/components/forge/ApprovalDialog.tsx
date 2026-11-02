import { useEffect, useRef, useState } from "react";
import { X, Mail, Download, Loader2, Copy } from "lucide-react";
import { engine } from "@/engine/projectEngine";
import { requestApproval, checkApproval } from "@/lib/approval.functions";

type Notify = (type: "success" | "error" | "info", message: string) => void;

export function ApprovalDialog({ open, onClose, notify, beforeSend }: { open: boolean; onClose: () => void; notify: Notify; beforeSend?: () => Promise<void> }) {
  const [tab, setTab] = useState<"send" | "get">("send");
  const [status, setStatus] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState("");
  const [input, setInput] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => { if (!open) { stop(); setStatus(""); setCode(""); setBusy(false); } return stop; }, [open]);
  if (!open) return null;

  const send = async () => {
    const meta = engine.meta;
    setBusy(true); setCode(""); setStatus("Menyimpan & mengirim email persetujuan…");
    try {
      await beforeSend?.();
      const r = await requestApproval({ data: { name: meta?.name ?? "Proyek", files: engine.fileList(), folders: engine.folderList() } });
      setStatus("Email terkirim ke Gmail Anda. Menunggu Anda menekan Setuju…");
      timer.current = setInterval(async () => {
        try {
          const s = await checkApproval({ data: r });
          if (s.status === "approved" && "code" in s) { stop(); setCode(s.code); setStatus("Disetujui. Masukkan kode ini di web tujuan (berlaku 30 menit, sekali pakai)."); setBusy(false); }
          else if (s.status === "denied") { stop(); setStatus("Ditolak. Proyek tidak dikirim."); setBusy(false); }
          else if (s.status === "expired" || s.status === "unknown" || s.status === "used") { stop(); setStatus("Permintaan sudah tidak berlaku."); setBusy(false); }
        } catch { /* keep polling */ }
      }, 4000);
    } catch (e) {
      setStatus(""); setBusy(false);
      notify("error", e instanceof Error ? e.message : "Gagal meminta persetujuan.");
    }
  };

  const get = async () => {
    setBusy(true); setStatus("Mengambil proyek…");
    try {
      const base = (src.trim() || window.location.origin).replace(/\/+$/, "");
      const res = await fetch(`${base}/api/public/pickup?code=${encodeURIComponent(input.trim().toUpperCase())}`);
      const j = (await res.json()) as { error?: string; project?: { name: string; files: { path: string; content: string }[]; folders: string[] } };
      if (!res.ok || !j.project) throw new Error(j.error ?? "Gagal mengambil.");
      const p = j.project;
      await engine.flush();
      await engine.createProject(`${p.name} (diterima)`, [
        ...p.folders.map((f) => ({ path: f.replace(/\/?$/, "/") })),
        ...p.files.map((f) => ({ path: f.path, content: f.content })),
      ]);
      notify("success", `Diterima ${p.files.length} berkas sebagai proyek baru.`);
      onClose();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Gagal mengambil.");
      setStatus("");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4" role="dialog" aria-modal="true" aria-label="Kirim dengan persetujuan Gmail">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Kirim ke web lain (persetujuan Gmail)</h2>
          <button className="btn-forge btn-ghost-forge" onClick={onClose} aria-label="Tutup"><X className="size-4" /></button>
        </div>
        <div className="mb-4 flex gap-2">
          <button className={`btn-forge ${tab === "send" ? "btn-primary-forge" : "btn-ghost-forge"}`} onClick={() => setTab("send")}>Kirim</button>
          <button className={`btn-forge ${tab === "get" ? "btn-primary-forge" : "btn-ghost-forge"}`} onClick={() => setTab("get")}>Ambil</button>
        </div>
        {tab === "send" ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Email berisi tombol Setuju / Tidak dikirim ke Gmail Anda. Setelah Setuju, kode sekali pakai muncul di sini.</p>
            <button className="btn-forge btn-primary-forge w-full justify-center" disabled={busy} onClick={send}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Minta persetujuan
            </button>
            {code && (
              <button className="btn-forge btn-ghost-forge w-full justify-center font-mono text-lg tracking-widest" onClick={() => { navigator.clipboard?.writeText(code); notify("success", "Kode disalin."); }}>
                {code} <Copy className="size-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <input className="w-full rounded-md border border-input bg-background px-3 py-2" placeholder="Alamat web pengirim (kosong = web ini)" value={src} onChange={(e) => setSrc(e.target.value)} />
            <input className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono uppercase" placeholder="Kode 8 huruf" maxLength={8} value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="btn-forge btn-primary-forge w-full justify-center" disabled={busy || input.trim().length !== 8} onClick={get}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Ambil proyek
            </button>
          </div>
        )}
        {status && <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">{status}</p>}
      </div>
    </div>
  );
}
