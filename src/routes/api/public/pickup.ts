import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "no-store",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/pickup")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        const code = (new URL(request.url).searchParams.get("code") ?? "").toUpperCase();
        if (!/^[A-Z0-9]{8}$/.test(code)) return json({ error: "Kode tidak valid" }, 400);
        const { sha256 } = await import("@/lib/approval.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const h = await sha256(code);
        const { data: row } = await supabaseAdmin
          .from("approval_requests")
          .select("id, payload")
          .eq("pickup_hash", h)
          .eq("status", "approved")
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        if (!row) return json({ error: "Kode sudah dipakai, kedaluwarsa, atau salah" }, 404);
        const { data } = await supabaseAdmin
          .from("approval_requests")
          .update({ status: "used", pickup_hash: null, payload: {} })
          .eq("id", row.id)
          .eq("status", "approved")
          .select("id")
          .maybeSingle();
        if (!data) return json({ error: "Kode sudah dipakai" }, 404);
        return json({ ok: true, project: row.payload });
      },
    },
  },
});
