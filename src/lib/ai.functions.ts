import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  mode: z.enum(["generate", "review"]),
  path: z.string().min(1),
  language: z.string().default("plaintext"),
  prompt: z.string().max(4000).optional(),
  content: z.string().max(60000).default(""),
});

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function callGateway(system: string, user: string) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI belum dikonfigurasi.");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (res.status === 429) throw new Error("Terlalu banyak permintaan, silakan tunggu sebentar.");
  if (res.status === 402) throw new Error("Kredit AI habis. Silakan lakukan top up.");
  if (!res.ok) throw new Error(`Permintaan AI gagal (${res.status}).`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

function stripFences(text: string) {
  const m = text.match(/^\s*```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```\s*$/);
  return (m?.[1] ?? text).replace(/\r\n/g, "\n");
}

export const assistFile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    if (data.mode === "generate") {
      const system =
        "You are a senior software engineer completing a single source file. " +
        "Return ONLY the full file content, no explanations, no markdown fences. " +
        "Match the file extension and language exactly. Keep it runnable and self-contained.";
      const user = [
        `File path: ${data.path}`,
        `Language: ${data.language}`,
        data.prompt?.trim()
          ? `User instruction: ${data.prompt.trim()}`
          : "No instruction was given. Infer a sensible, useful implementation from the file name, extension and any existing code.",
        data.content.trim() ? `Existing content:\n${data.content}` : "The file is currently empty.",
      ].join("\n\n");
      const out = await callGateway(system, user);
      return { mode: "generate" as const, content: stripFences(out) };
    }

    const system =
      "You review a source file for mistakes: syntax errors, wrong language for the extension, " +
      "typos in identifiers/keywords, misleading names, and logic that does not match its apparent intent. " +
      'Reply with strict JSON only: {"ok":boolean,"summary":string,"issues":[{"severity":"error"|"warning"|"info","line":number|null,"message":string}]}. ' +
      "Be concise. Max 8 issues. Use the same language as the user instruction if given, otherwise English.";
    const user = [
      `File path: ${data.path}`,
      `Language: ${data.language}`,
      data.prompt?.trim() ? `Extra context: ${data.prompt.trim()}` : "",
      `Content:\n${data.content || "(empty)"}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const raw = stripFences(await callGateway(system, user));
    try {
      const parsed = JSON.parse(raw) as {
        ok?: boolean;
        summary?: string;
        issues?: { severity?: string; line?: number | null; message?: string }[];
      };
      return {
        mode: "review" as const,
        ok: parsed.ok ?? true,
        summary: parsed.summary ?? "",
        issues: (parsed.issues ?? []).slice(0, 8).map((i) => ({
          severity: (i.severity === "error" || i.severity === "warning" ? i.severity : "info") as
            | "error"
            | "warning"
            | "info",
          line: typeof i.line === "number" ? i.line : null,
          message: i.message ?? "",
        })),
      };
    } catch {
      return { mode: "review" as const, ok: true, summary: raw.slice(0, 500), issues: [] };
    }
  });
