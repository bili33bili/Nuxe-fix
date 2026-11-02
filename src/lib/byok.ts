/**
 * Bring-your-own-key client (no Lovable AI involved).
 * Provider keys are kept in sessionStorage, not localStorage, so they are
 * cleared when the browser tab/session ends. Browser storage is still
 * accessible to same-origin JavaScript; never use this for high-value keys
 * on a site where untrusted scripts can run.
 */

export interface ByokSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
}

const STORAGE_KEY = "forge.byok.v1";
const LEGACY_STORAGE_KEY = STORAGE_KEY;

const env = import.meta.env as Record<string, string | undefined>;

export const envDefaults: ByokSettings = {
  baseUrl: env["VITE_AI_BASE_URL"] ?? "https://api.openai.com/v1",
  model: env["VITE_AI_MODEL"] ?? "gpt-4o-mini",
  // Do not inject VITE_AI_API_KEY into the browser bundle.
  apiKey: "",
};

function parseSettings(raw: string): ByokSettings {
  const parsed = JSON.parse(raw) as Partial<ByokSettings>;
  return {
    baseUrl: parsed.baseUrl?.trim() || envDefaults.baseUrl,
    model: parsed.model?.trim() || envDefaults.model,
    apiKey: parsed.apiKey?.trim() || "",
  };
}

export function loadByok(): ByokSettings {
  if (typeof window === "undefined") return { ...envDefaults };
  try {
    const current = window.sessionStorage.getItem(STORAGE_KEY);
    if (current) return parseSettings(current);

    // One-time migration from the older persistent localStorage location.
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const settings = parseSettings(legacy);
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return settings;
    }
    return { ...envDefaults };
  } catch {
    return { ...envDefaults };
  }
}

export function saveByok(settings: ByokSettings) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    throw new Error("Tidak dapat menyimpan pengaturan AI di sesi browser ini.");
  }
}

export function hasKey(settings: ByokSettings) {
  return settings.apiKey.trim().length > 0;
}

function stripFences(text: string) {
  const trimmed = text.trim();
  const fenced = /^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim() + "\n";
}

/** One completion call against the user's own provider. Returns file content. */
export async function generateWithKey(
  settings: ByokSettings,
  args: { path: string; content: string; prompt?: string },
  signal?: AbortSignal,
): Promise<string> {
  const base = settings.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: signal ?? null,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: "system",
          content:
            "You write file contents for a project scaffolding tool. Reply with the raw file content only — no markdown fences, no commentary. Keep it complete, valid, and idiomatic for the file's extension.",
        },
        {
          role: "user",
          content: [
            `File path: ${args.path}`,
            args.prompt?.trim() ? `Instruction: ${args.prompt.trim()}` : "Instruction: infer a sensible implementation from the path and extension.",
            args.content.trim() ? `Current content:\n${args.content.slice(0, 8000)}` : "Current content: (empty)",
          ].join("\n\n"),
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new Error("Kunci API ditolak oleh penyedia (401/403).");
    if (res.status === 429) throw new Error("Batas laju penyedia tercapai (429). Coba lagi nanti.");
    throw new Error(`Kesalahan penyedia ${res.status}: ${text.slice(0, 160)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content || !content.trim()) throw new Error("Penyedia mengembalikan respons kosong.");
  return stripFences(content);
}
