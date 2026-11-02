import { useEffect, useRef, useState } from "react";
import { Radio, X, Send, Download, Copy, Loader2, Users, Link2 } from "lucide-react";
import { engine } from "@/engine/projectEngine";

type Notify = (type: "success" | "error" | "info", message: string) => void;
type Peer = import("peerjs").default;
type ShareTab = "send" | "receive" | "collab";

interface Payload {
  kind: "project-forge-p2p";
  name: string;
  files: { path: string; content: string }[];
  folders: string[];
}

interface CollaborationSnapshot {
  type: "collab-snapshot";
  projectName: string;
  files: { path: string; content: string }[];
  folders: string[];
}

const PREFIX = "pforge-";
const COLLAB_PREFIX = "pforge-collab-";
const MAX_FILES = 20000;

function shortCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

function validPayload(d: unknown): d is Payload {
  if (!d || typeof d !== "object") return false;
  const p = d as Payload;
  return (
    p.kind === "project-forge-p2p" &&
    typeof p.name === "string" &&
    Array.isArray(p.files) &&
    p.files.length <= MAX_FILES &&
    p.files.every((f) => f && typeof f.path === "string" && typeof f.content === "string") &&
    Array.isArray(p.folders) &&
    p.folders.every((f) => typeof f === "string")
  );
}

function validCollabSnapshot(d: unknown): d is CollaborationSnapshot {
  if (!d || typeof d !== "object") return false;
  const p = d as CollaborationSnapshot;
  return (
    p.type === "collab-snapshot" &&
    typeof p.projectName === "string" &&
    Array.isArray(p.files) &&
    p.files.every((f) => f && typeof f.path === "string" && typeof f.content === "string") &&
    Array.isArray(p.folders) &&
    p.folders.every((f) => typeof f === "string")
  );
}

function makeProjectSnapshot(): CollaborationSnapshot {
  return {
    type: "collab-snapshot",
    projectName: engine.meta?.name ?? "Project Forger",
    files: engine.fileList(),
    folders: engine.folderList(),
  };
}

export function ShareDialog({
  open,
  onClose,
  notify,
  beforeSend,
  defaultTab = "send",
}: {
  open: boolean;
  onClose: () => void;
  notify: Notify;
  beforeSend?: () => Promise<void>;
  defaultTab?: ShareTab;
}) {
  const [tab, setTab] = useState<ShareTab>(defaultTab);
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [collabInput, setCollabInput] = useState("");
  const [collabMembers, setCollabMembers] = useState<string[]>([]);
  const [collabLink, setCollabLink] = useState("");
  const peerRef = useRef<Peer | null>(null);

  const cleanup = () => {
    peerRef.current?.destroy();
    peerRef.current = null;
    setCode("");
    setQr("");
    setStatus("");
    setBusy(false);
    setCollabMembers([]);
    setCollabLink("");
  };

  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }

    setTab(defaultTab);
    const fromUrl = new URLSearchParams(window.location.search).get("terima");
    const fromCollabUrl = new URLSearchParams(window.location.search).get("kolab");

    if (fromUrl) {
      setTab("receive");
      setInput(fromUrl.toUpperCase());
    }
    if (fromCollabUrl) {
      setTab("collab");
      setCollabInput(fromCollabUrl.toUpperCase());
    }

    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTab]);

  async function startSend() {
    const meta = engine.meta;
    if (!meta) return notify("error", "Buka proyek dulu sebelum mengirim.");
    cleanup();
    setBusy(true);
    setStatus("Menyimpan isi script…");
    await beforeSend?.();
    setStatus("Menyiapkan koneksi…");
    const payload: Payload = {
      kind: "project-forge-p2p",
      name: meta.name,
      files: engine.fileList(),
      folders: engine.folderList(),
    };
    const { default: PeerCls } = await import("peerjs");
    const c = shortCode();
    const peer = new PeerCls(PREFIX + c);
    peerRef.current = peer;
    peer.on("open", async () => {
      setCode(c);
      setBusy(false);
      setStatus("Menunggu penerima… biarkan jendela ini terbuka.");
      const QR = await import("qrcode");
      const url = `${window.location.origin}/?terima=${c}`;
      setQr(await QR.toDataURL(url, { margin: 1, width: 200 }));
    });
    peer.on("connection", (conn) => {
      setStatus("Penerima tersambung, mengirim…");
      conn.on("open", () => {
        conn.send(payload);
      });
      conn.on("data", (d) => {
        if (d === "ok") {
          setStatus(`Terkirim: ${payload.files.length} berkas beserta isi script-nya.`);
          notify("success", "Proyek berhasil dikirim.");
        }
      });
    });
    peer.on("error", (e) => {
      setBusy(false);
      setStatus("");
      notify("error", `Gagal membuat koneksi: ${e.type}`);
    });
  }

  async function startReceive() {
    const c = input.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(c)) return notify("error", "Kode harus 6 huruf/angka.");
    cleanup();
    setBusy(true);
    setStatus("Menghubungkan ke pengirim…");
    const { default: PeerCls } = await import("peerjs");
    const peer = new PeerCls();
    peerRef.current = peer;
    const timeout = setTimeout(() => {
      if (peerRef.current === peer) {
        notify("error", "Pengirim tidak ditemukan. Cek kode lalu coba lagi.");
        cleanup();
      }
    }, 20000);
    peer.on("open", () => {
      const conn = peer.connect(PREFIX + c, { reliable: true });
      conn.on("data", async (d) => {
        clearTimeout(timeout);
        if (!validPayload(d)) {
          notify("error", "Data yang diterima tidak valid. Proyek aktif tidak diubah.");
          cleanup();
          return;
        }
        try {
          setStatus("Menyimpan sebagai proyek baru…");
          await engine.flush();
          const items = [
            ...d.folders.map((f) => ({ path: f.replace(/\/?$/, "/") })),
            ...d.files.map((f) => ({ path: f.path, content: f.content })),
          ];
          await engine.createProject(`${d.name} (diterima)`, items);
          conn.send("ok");
          notify("success", `Diterima: ${d.files.length} berkas lengkap dengan isi script sebagai proyek baru.`);
          setTimeout(() => {
            cleanup();
            onClose();
          }, 400);
        } catch (e) {
          notify("error", `Gagal menyimpan: ${(e as Error).message}`);
          cleanup();
        }
      });
    });
    peer.on("error", (e) => {
      clearTimeout(timeout);
      notify("error", e.type === "peer-unavailable" ? "Kode tidak ditemukan atau pengirim sudah menutup." : `Gagal: ${e.type}`);
      cleanup();
    });
  }

  async function startCollabHost() {
    const meta = engine.meta;
    if (!meta) return notify("error", "Buka proyek dulu sebelum membuat room kolaborasi.");

    cleanup();
    setBusy(true);
    setStatus("Membuat room kolaborasi…");
    await beforeSend?.();

    const roomCode = shortCode();
    const snapshot = makeProjectSnapshot();
    const { default: PeerCls } = await import("peerjs");
    const peer = new PeerCls(COLLAB_PREFIX + roomCode);
    peerRef.current = peer;
    setCode(roomCode);
    setCollabMembers(["Anda"]);
    setCollabLink(`${window.location.origin}/?kolab=${roomCode}`);

    peer.on("open", () => {
      setBusy(false);
      setStatus("Room siap. Bagikan kode atau link untuk mengundang teman.");
    });

    peer.on("connection", (conn) => {
      const remote = conn.peer || "rekan";
      setCollabMembers((prev) => [...new Set([...prev, remote])]);
      setStatus(`Terhubung dengan ${remote}. Memperbarui data proyek…`);

      conn.on("open", () => {
        conn.send({ type: "presence", name: "Rekan" });
        conn.send(snapshot);
      });

      conn.on("data", (d) => {
        if (d && typeof d === "object" && (d as { type?: string }).type === "syncRequest") {
          conn.send(snapshot);
        }
      });
    });

    peer.on("error", (e) => {
      setBusy(false);
      setStatus("");
      notify("error", `Room kolaborasi gagal dibuat: ${e.type}`);
    });
  }

  async function joinCollabRoom() {
    const room = collabInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(room)) return notify("error", "Kode room harus 6 huruf/angka.");

    cleanup();
    setBusy(true);
    setStatus("Menyambungkan ke room kolaborasi…");

    const { default: PeerCls } = await import("peerjs");
    const peer = new PeerCls();
    peerRef.current = peer;
    const timeout = setTimeout(() => {
      if (peerRef.current === peer) {
        notify("error", "Room tidak ditemukan atau host sedang tidak aktif.");
        cleanup();
      }
    }, 20000);

    peer.on("open", () => {
      const conn = peer.connect(COLLAB_PREFIX + room, { reliable: true });
      conn.on("open", () => {
        conn.send({ type: "syncRequest", name: engine.meta?.name ?? "Project" });
      });
      conn.on("data", async (d) => {
        clearTimeout(timeout);
        if (!validCollabSnapshot(d)) {
          if (d && typeof d === "object" && (d as { type?: string }).type === "presence") {
            setCollabMembers((prev) => [...new Set([...prev, "Host"])])
            return;
          }
          notify("error", "Data room kolaborasi tidak valid.");
          cleanup();
          return;
        }

        try {
          setStatus("Menerima snapshot proyek dari room…");
          const items = [
            ...d.folders.map((f) => ({ path: f.replace(/\/?$/, "/") })),
            ...d.files.map((f) => ({ path: f.path, content: f.content })),
          ];
          await engine.createProject(`${d.projectName} (kolaborasi)`, items);
          await engine.flush();
          setCollabMembers((prev) => [...new Set([...prev, "Host"])])
          notify("success", `Room tersambung. Proyek kolaborasi ${d.projectName} berhasil dibuka.`);
          setTimeout(() => {
            cleanup();
            onClose();
          }, 400);
        } catch (e) {
          notify("error", `Gagal membuka proyek kolaborasi: ${(e as Error).message}`);
          cleanup();
        }
      });
    });

    peer.on("error", (e) => {
      clearTimeout(timeout);
      notify("error", e.type === "peer-unavailable" ? "Room kolaborasi tidak tersedia." : `Gagal: ${e.type}`);
      cleanup();
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="stack-in flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Kirim antar perangkat"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Radio className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Kirim antar perangkat / Kolaborasi</h2>
          <button className="ml-auto rounded p-1 hover:bg-muted" aria-label="Tutup" onClick={onClose}>
            <X className="size-4" />
          </button>
        </header>

        <div className="flex gap-1 border-b border-border p-2">
          {(["send", "receive", "collab"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                cleanup();
                setTab(t);
              }}
              className={`btn-forge flex-1 justify-center ${tab === t ? "btn-primary-forge" : "btn-ghost-forge"}`}
            >
              {t === "send" ? <Send className="size-4" /> : t === "receive" ? <Download className="size-4" /> : <Users className="size-4" />}
              {t === "send" ? "Kirim" : t === "receive" ? "Terima" : "Kolab"}
            </button>
          ))}
        </div>

        <div className="space-y-3 overflow-auto px-4 py-4 text-sm">
          <p className="text-xs text-muted-foreground">
            {tab === "collab"
              ? "Buang room kolaborasi untuk berbagi proyek dengan teman. Kode dapat dipakai untuk join room dan menerima snapshot proyek secara real-time."
              : "Berkas dikirim langsung dari perangkat ke perangkat, tanpa disimpan di server. Kedua perangkat harus online."}
          </p>

          {tab === "send" ? (
            <>
              {!code && (
                <button className="btn-forge btn-primary-forge w-full justify-center" disabled={busy} onClick={() => void startSend()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Buat kode kirim
                </button>
              )}
              {code && (
                <div className="flex flex-col items-center gap-3">
                  <div className="font-mono text-3xl font-bold tracking-[0.3em] text-primary">{code}</div>
                  <button
                    className="btn-forge btn-ghost-forge"
                    onClick={() => {
                      void navigator.clipboard?.writeText(code);
                      notify("info", "Kode disalin.");
                    }}
                  >
                    <Copy className="size-4" /> Salin kode
                  </button>
                  {qr && <img src={qr} alt="Kode QR untuk menerima proyek" className="size-48 rounded-lg bg-background p-2" />}
                  <p className="text-center text-xs text-muted-foreground">Pindai QR atau masukkan kode di perangkat lain.</p>
                </div>
              )}
            </>
          ) : tab === "receive" ? (
            <>
              <input
                className="input-forge text-center font-mono text-lg uppercase tracking-[0.3em]"
                value={input}
                maxLength={6}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                placeholder="KODE"
                aria-label="Kode dari pengirim"
              />
              <button className="btn-forge btn-primary-forge w-full justify-center" disabled={busy} onClick={() => void startReceive()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Terima proyek
              </button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <button className="btn-forge btn-primary-forge flex-1 justify-center" disabled={busy} onClick={() => void startCollabHost()}>
                  {busy && !code ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />} Buat room
                </button>
              </div>

              <input
                className="input-forge text-center font-mono text-lg uppercase tracking-[0.3em]"
                value={collabInput}
                maxLength={6}
                onChange={(e) => setCollabInput(e.target.value.toUpperCase())}
                placeholder="KODE ROOM"
                aria-label="Kode room kolaborasi"
              />
              <button className="btn-forge btn-ghost-forge w-full justify-center" disabled={busy} onClick={() => void joinCollabRoom()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />} Gabung room
              </button>

              {code && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Room aktif</p>
                  <div className="font-mono text-2xl font-bold tracking-[0.25em] text-primary">{code}</div>
                  {collabLink && (
                    <button
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-2 py-2 text-xs"
                      onClick={() => {
                        void navigator.clipboard?.writeText(collabLink);
                        notify("info", "Link room disalin.");
                      }}
                    >
                      <Link2 className="size-3.5" /> Salin link undangan
                    </button>
                  )}
                </div>
              )}

              {collabMembers.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Anggota</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {collabMembers.map((member) => (
                      <span key={member} className="rounded-full border border-border bg-background px-2 py-1">
                        {member}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {status && <p className="text-center text-xs text-muted-foreground" aria-live="polite">{status}</p>}
        </div>
      </div>
    </div>
  );
}

