import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const MAX_PAYLOAD = 4_000_000;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

const Body = z.object({
  id: z.string().uuid(),
  t: z.string().regex(/^[0-9a-f]{48}$/),
  name: z.string().min(1).max(200),
  files: z.array(z.object({ path: z.string().min(1).max(1000), content: z.string() })).max(20000),
  folders: z.array(z.string().min(1).max(1000)).max(20000),
});

export const Route = createFileRoute("/api/public/approve-attach")({
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
        if (!parsed.success) return json({ error: "Data proyek tidak valid" }, 400);
        const { id, t, name, files, folders } = parsed.data;

        const payloadStr = JSON.stringify({ name, files, folders });
        if (payloadStr.length > MAX_PAYLOAD) {
          return json({ error: "Proyek terlalu besar (maks 4 MB) untuk dikirim." }, 413);
        }

        const { sha256 } = await import("@/lib/approval.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("approval_requests")
          .select("id, status, token_hash, expires_at")
          .eq("id", id)
          .maybeSingle();
        if (!row || row.status !== "approved" || !row.token_hash || row.token_hash !== (await sha256(t))) {
          return json({ error: "Izin sudah diproses atau tidak berlaku" }, 409);
        }
        if (new Date(row.expires_at) < new Date()) return json({ error: "Izin sudah kedaluwarsa" }, 410);

        const { data: updated } = await supabaseAdmin
          .from("approval_requests")
          .update({
            payload: { name, files, folders },
            token_hash: null,
            expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
          })
          .eq("id", id)
          .eq("status", "approved")
          .not("token_hash", "is", null)
          .select("id")
          .maybeSingle();
        if (!updated) return json({ error: "Izin sudah diproses" }, 409);
        return json({ ok: true, files: files.length, folders: folders.length });
      },
    },
  },
});
