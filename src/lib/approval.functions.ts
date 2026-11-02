import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const MAX_PAYLOAD = 4_000_000;

export const requestApproval = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(200),
        files: z.array(z.object({ path: z.string().max(1000), content: z.string() })).max(20000),
        folders: z.array(z.string().max(1000)).max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const payloadStr = JSON.stringify(data);
    if (payloadStr.length > MAX_PAYLOAD) throw new Error("Proyek terlalu besar (maks 4 MB) untuk dikirim lewat persetujuan.");
    const { sha256, randomToken, sendOwnerEmail, escapeHtml } = await import("./approval.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = randomToken();
    const poll = randomToken();
    const { data: row, error } = await supabaseAdmin
      .from("approval_requests")
      .insert({
        token_hash: await sha256(token),
        poll_hash: await sha256(poll),
        action: "send_project",
        title: data.name,
        payload: data,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error("Gagal membuat permintaan.");
    const origin = new URL(getRequest().url).origin;
    const link = `${origin}/api/public/approve?id=${row.id}&t=${token}`;
    const name = escapeHtml(data.name);
    await sendOwnerEmail(
      `Persetujuan: kirim proyek "${data.name}"`,
      `<div style="font-family:Arial,sans-serif;max-width:480px">
<h2>Permintaan persetujuan</h2>
<p>Ada permintaan untuk mengirim proyek <b>${name}</b> (${data.files.length} berkas) ke web lain.</p>
<p>Buka link di bawah, lalu pilih <b>Setuju</b> atau <b>Tidak</b>. Link hanya bisa dipakai sekali dan berlaku 30 menit.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Buka persetujuan</a></p>
<p style="color:#666;font-size:12px">Kalau Anda tidak meminta ini, abaikan saja atau pilih Tidak.</p></div>`,
    );
    return { id: row.id as string, poll };
  });

export const checkApproval = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), poll: z.string().min(10).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { sha256, shortCode } = await import("./approval.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("approval_requests")
      .select("status, poll_hash, expires_at, pickup_hash")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || row.poll_hash !== (await sha256(data.poll))) return { status: "unknown" as const };
    if (row.status === "pending" && new Date(row.expires_at) < new Date()) return { status: "expired" as const };
    if (row.status === "approved" && !row.pickup_hash) {
      const code = shortCode();
      await supabaseAdmin
        .from("approval_requests")
        .update({ pickup_hash: await sha256(code), expires_at: new Date(Date.now() + 30 * 60_000).toISOString() })
        .eq("id", data.id);
      return { status: "approved" as const, code };
    }
    return { status: row.status as "pending" | "approved" | "denied" | "used" };
  });
