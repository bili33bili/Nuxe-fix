import { createFileRoute } from "@tanstack/react-router";

function page(body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Persetujuan</title>
<style>body{font-family:system-ui,sans-serif;background:#0f0f10;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}.c{max-width:420px;background:#1a1a1c;border:1px solid #333;border-radius:14px;padding:24px}button{font-size:16px;padding:12px 20px;border-radius:8px;border:0;cursor:pointer;margin:0 8px 8px 0}.y{background:#22c55e;color:#000}.n{background:#ef4444;color:#fff}#out p{margin:8px 0}</style></head><body><div class="c">${body}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
}
const gone = () => page("<h2>Link tidak berlaku</h2><p>Link ini sudah dipakai, kedaluwarsa, atau salah.</p>", 404);

type Row = {
  id: string;
  title: string;
  status: string;
  token_hash: string | null;
  expires_at: string;
  payload: { name?: string; files?: unknown[] } | null;
};

async function load(id: string | null, t: string | null) {
  if (!id || !t || !/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{48}$/.test(t)) return null;
  const { sha256 } = await import("@/lib/approval.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("approval_requests")
    .select("id, title, status, token_hash, expires_at, payload")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.status !== "pending" || !data.token_hash || data.token_hash !== (await sha256(t))) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return { row: data as Row, supabaseAdmin };
}

function esc(s: string) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Halaman unggah proyek dari perangkat pemilik (pemohon minta tanpa membawa isi proyek). */
function attachPage(id: string, t: string) {
  const script = [
    'var ID="' + id + '",T="' + t + '";',
    'var out=document.getElementById("out");',
    'function openDb(){return new Promise(function(res,rej){var r=indexedDB.open("project-forge",1);r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error||new Error("gagal"))}})}',
    'function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}',
    "openDb().then(function(db){",
    ' return new Promise(function(res,rej){var r=db.transaction("projects","readonly").objectStore("projects").getAll();r.onsuccess=function(){res(r.result||[])};r.onerror=function(){rej(r.error)}}).then(function(ps){return{db:db,ps:ps}});',
    "}).then(function(x){",
    " var ps=x.ps.sort(function(a,b){return b.updatedAt-a.updatedAt});",
    ' if(!ps.length){out.textContent="Tidak ada proyek di perangkat ini. Buka link persetujuan ini di perangkat tempat proyek disimpan.";return}',
    ' out.innerHTML="";',
    ' var t=document.createElement("p");t.textContent="Pilih proyek yang akan dikirim ke pemohon:";out.appendChild(t);',
    " ps.slice(0,20).forEach(function(p){",
    ' var b=document.createElement("button");b.className="y";b.textContent=p.name;',
    ' b.onclick=function(){kirim(x.db,p)};',
    "  out.appendChild(b);",
    " });",
    " var n=document.createElement(\"p\");n.style.color=\"#999\";n.textContent=\"Proyek dibaca langsung dari perangkat ini. Isi proyek tidak berubah.\";out.appendChild(n);",
    "}).catch(function(e){out.textContent=\"Gagal membuka penyimpanan: \"+(e&&e.message?e.message:e)});",
    "function kirim(db,p){",
    ' out.textContent="Menyiapkan "+p.name+"\\u2026";',
    ' var r=db.transaction("nodes","readonly").objectStore("nodes").index("projectId").getAll(p.id);',
    " r.onsuccess=function(){",
    "  var nodes=r.result||[];var map={};nodes.forEach(function(n){map[n.id]=n});",
    "  function pathOf(n){var parts=[];var cur=n;var g=0;while(cur&&g++<200){parts.unshift(cur.name);cur=cur.parentId?map[cur.parentId]:null}return parts.join(\"/\")}",
    "  var files=[],folders=[];",
    "  nodes.forEach(function(n){if(n.type===\"folder\"){folders.push(pathOf(n)+\"/\")}else{files.push({path:pathOf(n),content:n.content||\"\"})}});",
    '  out.textContent="Mengunggah "+files.length+" berkas\\u2026";',
    '  fetch("/api/public/approve-attach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:ID,t:T,name:p.name,files:files,folders:folders})})',
    "  .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})",
    "  .then(function(x2){",
    '   if(x2.ok){out.innerHTML="<p>Proyek <b>"+esc(p.name)+"</b> siap diambil web pemohon.</p>"}',
    '   else{out.textContent="Gagal: "+((x2.j&&x2.j.error)||"server menolak")}',
    "  }).catch(function(e){out.textContent=\"Gagal mengirim: \"+(e.message||e)});",
    " };",
    ' r.onerror=function(){out.textContent="Gagal membaca berkas proyek."};',
    "}",
  ].join("\n");
  return page(
    `<h2>Disetujui ✓</h2><p>Satu langkah lagi: pilih proyek yang akan dikirim. Proyek dibaca langsung dari perangkat ini.</p><div id="out"><p>Menyiapkan\\u2026</p></div><script>${script}<\\/script>`,
  );
}

export const Route = createFileRoute("/api/public/approve")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const id = u.searchParams.get("id");
        const t = u.searchParams.get("t");
        const r = await load(id, t);
        if (!r) return gone();
        const hasPayload = !!(r.row.payload && Array.isArray(r.row.payload.files) && r.row.payload.files.length > 0);
        const note = hasPayload
          ? "Kalau setuju, proyek ini bisa diambil sekali oleh web lain memakai kode."
          : "Kalau setuju, Anda akan memilih proyek dari perangkat ini untuk dikirim ke pemohon.";
        return page(`<h2>Kirim proyek "${esc(r.row.title)}"?</h2><p>${note}</p>
<form method="post"><input type="hidden" name="id" value="${id}"><input type="hidden" name="t" value="${t}">
<button class="y" name="d" value="yes">Setuju</button><button class="n" name="d" value="no">Tidak</button></form>`);
      },
      POST: async ({ request }) => {
        const f = await request.formData();
        const id = String(f.get("id") ?? "");
        const t = String(f.get("t") ?? "");
        const r = await load(id, t);
        if (!r) return gone();
        const yes = f.get("d") === "yes";
        const hasPayload = !!(r.row.payload && Array.isArray(r.row.payload.files) && r.row.payload.files.length > 0);
        if (yes) {
          // Proyek sudah terlampir (alur dialog): kosongkan token. Alur pemohon:
          // token dipertahankan agar halaman ini bisa mengunggah proyek dari perangkat.
          await r.supabaseAdmin
            .from("approval_requests")
            .update(
              hasPayload
                ? { status: "approved", token_hash: null }
                : { status: "approved", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() },
            )
            .eq("id", r.row.id)
            .eq("status", "pending");
        } else {
          await r.supabaseAdmin
            .from("approval_requests")
            .update({ status: "denied", token_hash: null })
            .eq("id", r.row.id)
            .eq("status", "pending");
          return page("<h2>Dibatalkan</h2><p>Permintaan sudah dibatalkan.</p>");
        }
        if (hasPayload) {
          return page("<h2>Disetujui ✓</h2><p>Kembali ke Project Forge untuk melihat kode ambil.</p>");
        }
        return attachPage(id, t);
      },
    },
  },
});
