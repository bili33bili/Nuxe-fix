import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthMode = "login" | "signup";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;

    try {
      const auth = supabase.auth;
      const listener = auth.onAuthStateChange((_event, nextSession) => {
        if (active) {
          setSession(nextSession);
          setChecking(false);
        }
      });
      subscription = listener.data.subscription;
      void auth.getSession().then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setError(sessionError.message);
        setSession(data.session);
        setChecking(false);
      }).catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Tidak dapat memeriksa sesi.");
        setChecking(false);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Konfigurasi Supabase belum tersedia.");
      setChecking(false);
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const auth = supabase.auth;
      if (mode === "signup") {
        const { data, error: authError } = await auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (authError) throw authError;
        if (data.session) setSession(data.session);
        else setMessage("Pendaftaran berhasil. Periksa email untuk konfirmasi sebelum masuk.");
      } else {
        const { data, error: authError } = await auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        setSession(data.session);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Autentikasi gagal.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setError("Masukkan email terlebih dahulu.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (authError) throw authError;
      setMessage("Jika email terdaftar, tautan pemulihan akan dikirim.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Permintaan pemulihan gagal.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError("");
    try {
      const { error: authError } = await supabase.auth.signOut();
      if (authError) throw authError;
      setSession(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal keluar.");
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-background text-foreground"><p className="text-sm text-muted-foreground">Memeriksa sesi akun…</p></main>;
  }

  if (session) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-end gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="max-w-[60vw] truncate">{session.user?.email}</span>
          <button type="button" onClick={() => void signOut()} disabled={busy} className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted disabled:opacity-50">
            {busy ? "Memproses…" : "Keluar"}
          </button>
        </div>
        {children}
        {error && <p role="alert" className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-destructive/40 bg-background p-3 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Nuxe Workspace</p>
          <h1 className="mt-2 text-2xl font-bold">{mode === "login" ? "Masuk ke akun" : "Buat akun"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Masuk untuk membuka workspace dan mengelola proyek Anda.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring" placeholder="nama@email.com" />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span>Kata sandi</span>
            <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring" placeholder="Minimal 6 karakter" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{message}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"}
          </button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }} className="text-primary hover:underline">
            {mode === "login" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
          </button>
          {mode === "login" && <button type="button" onClick={() => void resetPassword()} disabled={busy} className="text-muted-foreground hover:text-foreground hover:underline">Lupa sandi?</button>}
        </div>
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">Autentikasi menggunakan Supabase. Admin proyek perlu mengaktifkan Email provider dan mengatur URL redirect pada Supabase Authentication.</p>
      </section>
    </main>
  );
}
