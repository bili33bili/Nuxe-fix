function getOwnerEmail() {
  const email = process.env["APPROVAL_OWNER_EMAIL"]?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("APPROVAL_OWNER_EMAIL belum diatur dengan benar");
  }
  return email;
}

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 24) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function shortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(a, (b) => chars[b % chars.length]).join("");
}

const b64 = (s: string) =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const header = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

export async function sendOwnerEmail(subject: string, html: string) {
  const lov = process.env["LOVABLE_API_KEY"];
  const gm = process.env["GOOGLE_MAIL_API_KEY"];
  const ownerEmail = getOwnerEmail();
  if (!lov || !gm) throw new Error("Gmail belum tersambung");
  const msg = [
    `To: ${ownerEmail}`,
    `Subject: ${header(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");
  const raw = b64(msg).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lov}`,
      "X-Connection-Api-Key": gm,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`Gmail send failed [${res.status}]: ${t}`);
    throw new Error(`Gagal kirim email [${res.status}]`);
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
