import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

const MAX_PENDING = 5;
const WINDOW_MIN = 15;

const Body = z.object({
  name: z.string().min(1).max(200),
  site: z.string().max(300).optional(),
});

export const Route = createFileRoute("/api/public/request-access")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Isi permintaan tidak valid" }, 400);
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) return json({ error: "Nama proyek wajib diisi (1-200 karakter)" }, 400);
        const { name, site } = parsed.data;

        const { sha256, randomToken, sendOwnerEmail, escapeHtml } = await import("@/lib/approval.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Anti-spam: batasi permintaan beruntun dalam satu jendela waktu.
        const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
        const { count } = await supabaseAdmin
          .from("approval_requests")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);
        if ((count ?? 0) >= MAX_PENDING) {
          return json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, 429);
        }

        const token = randomToken();
        const poll = randomToken();
        const { data: row, error } = await supabaseAdmin
          .from("approval_requests")
          .insert({
            token_hash: await sha256(token),
            poll_hash: await sha256(poll),
            action: "send_project",
            title: name,
            payload: {},
          })
          .select("id")
          .single();
        if (error || !row) return json({ error: "Gagal membuat permintaan" }, 500);

        const origin = new URL(request.url).origin;
        const link = `${origin}/api/public/approve?id=${row.id}&t=${token}`;
        const watch = `${origin}/api/public/access?id=${row.id}&poll=${poll}`;
        const safeName = escapeHtml(name);
        const safeSite = site ? escapeHtml(site.slice(0, 300)) : "";
        await sendOwnerEmail(
          `Permintaan akses proyek "${name}"`,
          `<div style="font-family:Arial,sans-serif;max-width:480px">
<h2>Ada yang minta akses proyek</h2>
<p>Sebuah web${safeSite ? ` (${safeSite})` : ""} meminta proyek <b>${safeName}</b>.</p>
<p>Buka link di bawah di perangkat yang sama dengan tempat proyek tersimpan, lalu pilih <b>Setuju</b> atau <b>Tidak</b>. Link hanya bisa dipakai sekali dan berlaku 30 menit.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Buka persetujuan</a></p>
<p style="color:#666;font-size:12px">Kalau Anda tidak meminta ini, abaikan saja atau pilih Tidak.</p></div>`,
        ).catch(() => {
          // Email gagal tetap membuat baris; pemohon bisa minta ulang.
        });

        return json({ ok: true, id: row.id, poll, watch_url: watch });
      },
    },
  },
});
