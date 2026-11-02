import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Copy, Check, Loader2, Mail, ShieldCheck, XCircle } from "lucide-react";

export const Route = createFileRoute("/minta-akses")({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "robots", content: "noindex, nofollow" },
      { title: "Minta Akses Proyek — PROJECT FORGE" },
      {
        name: "description",
        content:
          "Halaman permintaan izin akses proyek: web pemohon meminta izin, pemilik menyetujui lewat Gmail, proyek dikirim sekali.",
      },
      { property: "og:title", content: "Minta Akses Proyek — PROJECT FORGE" },
      {
        property: "og:description",
        content: "Web pemohon meminta izin, pemilik menyetujui lewat Gmail, proyek dikirim sekali.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MintaAksesPage,
});

type State =
  | { phase: "form" }
  | { phase: "sending" }
  | { phase: "waiting"; id: string; poll: string; watch: string }
  | { phase: "granted"; name: string }
  | { phase: "denied" }
  | { phase: "delivered" };

function MintaAksesPage() {
  const [state, setState] = useState<State>({ phase: "form" });
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"watch" | "code" | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.phase !== "waiting") {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    const { id, poll } = state;
    timer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/access?id=${encodeURIComponent(id)}&poll=${encodeURIComponent(poll)}`);
        const j = (await res.json()) as { status?: string; project?: { name?: string } | null };
        if (j.status === "approved" && j.project) {
          setState({ phase: "granted", name: j.project.name ?? "Proyek" });
        } else if (j.status === "approved") {
          // Setuju tapi proyek belum diunggah; terus pantau.
        } else if (j.status === "denied") {
          setState({ phase: "denied" });
        } else if (j.status === "delivered") {
          setState({ phase: "delivered" });
        }
      } catch {
        /* terus pantau */
      }
    }, 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [state]);

  const request = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Isi nama proyek yang diminta.");
      return;
    }
    setState({ phase: "sending" });
    try {
      const res = await fetch("/api/public/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), site: site.trim() || undefined }),
      });
      const j = (await res.json()) as { error?: string; id?: string; poll?: string; watch_url?: string };
      if (!res.ok || !j.id || !j.poll || !j.watch_url) {
        setState({ phase: "form" });
        setError(j.error ?? "Gagal membuat permintaan.");
        return;
      }
      setState({ phase: "waiting", id: j.id, poll: j.poll, watch: j.watch_url });
    } catch {
      setState({ phase: "form" });
      setError("Gagal terhubung. Coba lagi.");
    }
  };

  const copy = async (text: string, which: "watch" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard tidak tersedia */
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet =
    state.phase === "waiting"
      ? [
          "const res = await fetch(\"" + state.watch + "\");",
          "const data = await res.json();",
          "// data.status: \"pending\" | \"denied\" | \"approved\" | \"delivered\"",
          "if (data.status === \"approved\" && data.project) {",
          "  // data.project = { name, files: [{path, content}], folders: [\"folder/\"] }",
          "}",
        ].join("\n")
      : "";

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-md">
        <div className="glass-panel rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <Mail className="size-5 text-primary" />
            <h1 className="text-lg font-semibold">Minta Akses Proyek</h1>
          </div>

          {state.phase === "form" && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Untuk pemilik web lain: isi nama proyek yang diminta, lalu tekan tombol di bawah. Pemilik proyek akan
                menerima email persetujuan (Setuju / Tidak). Kalau disetujui, salinan proyek dikirim sekali ke web
                Anda &mdash; proyek asli tidak berubah.
              </p>
              <label className="mb-3 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nama proyek yang diminta
                <input
                  className="input-forge mt-1.5 normal-case"
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="mis. struktur-sistem"
                />
              </label>
              <label className="mb-4 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Alamat web Anda (opsional)
                <input
                  className="input-forge mt-1.5 normal-case"
                  value={site}
                  maxLength={300}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="mis. https://proyek-saya.lovable.app"
                />
              </label>
              {error && (
                <p role="alert" className="mb-3 rounded-md bg-destructive/15 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
              <button
                className="btn-forge btn-primary-forge w-full justify-center"
                disabled={state.phase === "sending"}
                onClick={() => void request()}
              >
                {state.phase === "sending" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" />
                )}
                Minta Akses Proyek
              </button>
            </>
          )}

          {state.phase === "waiting" && (
            <>
              <p className="mb-3 text-sm">
                Permintaan terkirim. Email persetujuan sudah dikirim ke Gmail pemilik proyek. Halaman ini memantau
                izin secara otomatis.
              </p>
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Menunggu persetujuan&hellip; Pemilik harus membuka link di email pada perangkat yang sama dengan
                  tempat proyek disimpan, lalu memilih proyeknya.
                </p>
              </div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tautan pantau untuk web Anda
              </p>
              <button
                className="btn-forge btn-ghost-forge mb-3 w-full justify-start font-mono text-[11px] break-all"
                onClick={() => void copy(state.watch, "watch")}
              >
                {copied === "watch" ? <Check className="size-4 shrink-0" /> : <Copy className="size-4 shrink-0" />}
                <span className="truncate">{state.watch}</span>
              </button>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Contoh kode untuk web Anda
              </p>
              <button
                className="btn-forge btn-ghost-forge mb-3 w-full justify-start"
                onClick={() => void copy(snippet, "code")}
              >
                {copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />} Salin kode
              </button>
              <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
                {snippet}
              </pre>
            </>
          )}

          {state.phase === "granted" && (
            <div className="text-center">
              <ShieldCheck className="mx-auto mb-2 size-10 text-green-500" />
              <h2 className="text-base font-semibold">Disetujui &mdash; proyek siap diambil</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Web Anda tinggal memanggil tautan pantau sekali: responsnya berisi isi proyek &ldquo;{state.name}
                &rdquo; ({name}). Tautan hanya bisa dipakai sekali.
              </p>
            </div>
          )}

          {state.phase === "denied" && (
            <div className="text-center">
              <XCircle className="mx-auto mb-2 size-10 text-destructive" />
              <h2 className="text-base font-semibold">Ditolak</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Pemilik tidak memberikan izin. Tidak ada proyek yang dikirim.
              </p>
            </div>
          )}

          {state.phase === "delivered" && (
            <div className="text-center">
              <Check className="mx-auto mb-2 size-10 text-green-500" />
              <h2 className="text-base font-semibold">Proyek sudah diserahkan</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Izin ini sudah dipakai. Untuk meminta lagi, buat permintaan baru.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline underline-offset-2 hover:text-foreground">
            Kembali ke PROJECT FORGE
          </Link>
        </p>
      </div>
    </div>
  );
}
