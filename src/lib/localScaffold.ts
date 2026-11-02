/**
 * Offline, no-AI fallback engine.
 * 1. scaffoldFor()  -> deterministic starter script for a file, based on extension + path.
 * 2. lintScript()   -> simple static checks (typos, unbalanced brackets/quotes, stray markers).
 * Nothing here calls the network. It is the fallback when no API key is configured.
 */

export interface LintIssue {
  severity: "error" | "warning" | "info";
  line: number | null;
  message: string;
}

export function extOf(path: string) {
  const name = path.split("/").pop() ?? path;
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function baseName(path: string) {
  const name = path.split("/").pop() ?? path;
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function pascal(input: string) {
  return (
    input
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((s) => s[0]!.toUpperCase() + s.slice(1))
      .join("") || "Module"
  );
}

function camel(input: string) {
  const p = pascal(input);
  return p[0]!.toLowerCase() + p.slice(1);
}

/** Deterministic starter content for a file path. */
export function scaffoldFor(path: string, hint?: string): string {
  const ext = extOf(path);
  const base = baseName(path);
  const Name = pascal(base);
  const name = camel(base);
  const note = hint?.trim() ? `// Note: ${hint.trim()}\n` : "";

  switch (ext) {
    case "ts":
    case "js":
    case "mjs":
    case "cjs": {
      const typed = ext === "ts";
      return `${note}/**
 * ${path}
 * Generated starter — replace the body with real logic.
 */

export function ${name}(options${typed ? ": { name: string }" : ""}) {
  if (!options || !options.name) {
    throw new Error("${name}: 'name' wajib diisi");
  }
  return { ok: true, name: options.name };
}

export default ${name};
`;
    }

    case "tsx":
    case "jsx":
      return `${note}/**
 * ${path}
 */

export function ${Name}() {
  return (
    <section className="p-4">
      <h2 className="text-lg font-semibold">${Name}</h2>
      <p>Replace this placeholder with the real UI.</p>
    </section>
  );
}

export default ${Name};
`;
    case "html":
      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${Name}</title>
  </head>
  <body>
    <main>
      <h1>${Name}</h1>
      <p>Replace this placeholder content.</p>
    </main>
  </body>
</html>
`;
    case "css":
      return `/* ${path} */
:root {
  --spacing: 1rem;
}

.${name || "root"} {
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
}
`;
    case "json":
      return `{
  "name": "${base}",
  "version": "0.1.0",
  "description": "${hint?.trim() ?? "Generated placeholder"}"
}
`;
    case "md":
      return `# ${Name}

${hint?.trim() ?? "Describe this document here."}

## Usage

1. Step one
2. Step two
`;
    case "py":
      return `"""${path}"""


def ${name || "main"}() -> dict:
    """Replace with real logic."""
    return {"ok": True}


if __name__ == "__main__":
    print(${name || "main"}())
`;
    case "sh":
      return `#!/usr/bin/env bash
set -euo pipefail

# ${path}
main() {
  echo "${Name} ready"
}

main "$@"
`;
    case "sql":
      return `-- ${path}
select 1 as ok;
`;
    case "yml":
    case "yaml":
      return `# ${path}
name: ${base}
version: 0.1.0
`;
    case "txt":
    case "":
      return `${Name}\n\n${hint?.trim() ?? "Replace this placeholder text."}\n`;
    default:
      return `${note}// ${path}
// Generated placeholder for .${ext} files. Replace with real content.
`;
  }
}

const TYPOS: Record<string, string> = {
  fucntion: "function",
  funtion: "function",
  functoin: "function",
  retrun: "return",
  reutrn: "return",
  cosole: "console",
  consol: "console",
  conosle: "console",
  lenght: "length",
  documnet: "document",
  widnow: "window",
  improt: "import",
  exprot: "export",
  ture: "true",
  flase: "false",
  nul: "null",
  udnefined: "undefined",
  cnst: "const",
  vaar: "var",
  esle: "else",
  wihle: "while",
  swithc: "switch",
  clas: "class",
  pubic: "public",
  privte: "private",
  strig: "string",
  numbre: "number",
  boolen: "boolean",
  asnyc: "async",
  awiat: "await",
  requrie: "require",
  moduel: "module",
  defualt: "default",
  paramters: "parameters",
  reponse: "response",
  recieve: "receive",
  seperator: "separator",
};

const CODE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "css",
  "scss",
  "json",
  "java",
  "c",
  "cpp",
  "cs",
  "go",
  "rs",
  "php",
]);

/** Simple static review — no AI, no code execution. */
export function lintScript(path: string, content: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const ext = extOf(path);
  const lines = content.split("\n");

  if (!content.trim()) {
    issues.push({ severity: "warning", line: null, message: "File kosong — belum ada yang perlu diperiksa." });
    return issues;
  }

  // Typos
  lines.forEach((line, i) => {
    const words = line.match(/[A-Za-z_]{3,}/g) ?? [];
    const seen = new Set<string>();
    for (const w of words) {
      const low = w.toLowerCase();
      const fix = TYPOS[low];
      if (fix && !seen.has(low)) {
        seen.add(low);
        issues.push({ severity: "error", line: i + 1, message: `Kemungkinan salah ketik "${w}" — maksud Anda "${fix}"?` });
      }
    }
    if (/\bTODO\b|\bFIXME\b/.test(line)) {
      issues.push({ severity: "info", line: i + 1, message: "Masih ada penanda belum selesai (TODO/FIXME) di file ini." });
    }
    if (/\s+$/.test(line) && line.trim()) {
      // low noise: only report once
    }
  });

  if (CODE_EXT.has(ext)) {
    // Bracket balance, ignoring strings and comments (single-line approximation).
    const stack: { ch: string; line: number }[] = [];
    const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    let inBlockComment = false;
    lines.forEach((raw, i) => {
      let line = raw;
      if (inBlockComment) {
        const end = line.indexOf("*/");
        if (end === -1) return;
        line = line.slice(end + 2);
        inBlockComment = false;
      }
      line = line.replace(/\/\*[\s\S]*?\*\//g, "");
      const open = line.indexOf("/*");
      if (open !== -1) {
        inBlockComment = true;
        line = line.slice(0, open);
      }
      line = line.replace(/\/\/.*$/, "");
      const stripped = line.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/`(?:\\.|[^`\\])*`/g, "``");

      // Unterminated quote heuristic
      const dq = (stripped.match(/"/g) ?? []).length;
      const sq = (stripped.match(/'/g) ?? []).length;
      if (dq % 2 === 1 || sq % 2 === 1) {
        issues.push({ severity: "error", line: i + 1, message: "Tanda kutip tampaknya belum ditutup pada baris ini." });
      }

      for (const ch of stripped) {
        if (ch === "(" || ch === "[" || ch === "{") stack.push({ ch, line: i + 1 });
        else if (ch === ")" || ch === "]" || ch === "}") {
          const last = stack.pop();
          if (!last) {
            issues.push({ severity: "error", line: i + 1, message: `Ada penutup "${ch}" berlebih tanpa pembuka yang cocok.` });
          } else if (last.ch !== pairs[ch]) {
            issues.push({
              severity: "error",
              line: i + 1,
              message: `Tanda kurung tidak cocok: "${last.ch}" dibuka pada baris ${last.line} ditutup dengan "${ch}".`,
            });
          }
        }
      }
    });
    for (const left of stack.slice(0, 3)) {
      issues.push({ severity: "error", line: left.line, message: `"${left.ch}" tidak pernah ditutup.` });
    }
  }

  if (ext === "json") {
    try {
      JSON.parse(content);
    } catch (e) {
      issues.push({ severity: "error", line: null, message: `JSON tidak valid: ${(e as Error).message}` });
    }
  }

  if (issues.length > 12) return issues.slice(0, 12).concat({ severity: "info", line: null, message: `…dan ${issues.length - 12} lainnya.` });
  return issues;
}
