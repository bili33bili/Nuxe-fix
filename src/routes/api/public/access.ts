import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "no-store",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

type Payload = { name?: string; files?: { path: string; content: string }[]; folders?: string[] } | null;

export const Route = createFileRoute("/api/public/access")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const id = u.searchParams.get("id");
        const poll = u.searchParams.get("poll");
        if (!id || !poll || !/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{48}$/.test(poll)) {
          return json({ error: "Parameter tidak valid" }, 400);
        }
        const { sha256 } = await import("@/lib/approval.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("approval_requests")
          .select("status, poll_hash, expires_at, payload")
          .eq("id", id)
          .maybeSingle();
        if (!row || row.poll_hash !== (await sha256(poll))) return json({ status: "unknown" });
        if (row.status === "pending" && new Date(row.expires_at) < new Date()) {
          return json({ status: "expired" });
        }
        if (row.status === "denied") return json({ status: "denied" });
        if (row.status === "used") return json({ status: "delivered" });
        if (row.status === "approved") {
          const payload = (row.payload ?? null) as Payload;
          if (payload && Array.isArray(payload.files) && payload.files.length > 0) {
            // Serahkan proyek sekali, lalu tandai sudah dipakai.
            const { data: consumed } = await supabaseAdmin
              .from("approval_requests")
              .update({ status: "used", payload: {}, pickup_hash: null })
              .eq("id", id)
              .eq("status", "approved")
              .select("id")
              .maybeSingle();
            // Only the request that atomically consumes the approval may receive its payload.
            if (!consumed) return json({ status: "delivered" });
            return json({ status: "approved", project: payload });
          }
          return json({ status: "approved", project: null });
        }
        return json({ status: "pending" });
      },
    },
  },
});
