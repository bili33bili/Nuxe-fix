export interface ParsedItem {
  path: string;
}

export interface ParseResult {
  items: ParsedItem[];
  rootName: string | null;
  errors: { line: number; text: string; message: string }[];
}

/** Normalizes paths before they can enter the project engine. No absolute or traversal paths. */
export function validatePaths<T extends { path: string; content?: string | undefined }>(items: T[]): T[] {
  if (!items.length || items.length > 20000) throw new Error("Jumlah item tidak valid (maksimum 20.000).");
  const seen = new Map<string, "file" | "folder">();
  for (const item of items) {
    const path = item.path;
    const parts = path.replace(/\/$/, "").split("/");
    if (!path || path.startsWith("/") || path.includes("\\") || parts.some((p) => !p || p === "." || p === ".." || /[\x00-\x1f]/.test(p)))
      throw new Error(`Jalur tidak aman: ${path}`);
    if (item.content !== undefined && typeof item.content !== "string") throw new Error(`Isi file tidak valid: ${path}`);
    const key = parts.join("/");
    const kind = path.endsWith("/") ? "folder" : "file";
    if (seen.has(key)) throw new Error(`Nama ganda: ${path}`);
    seen.set(key, kind);
  }
  for (const [path] of seen) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      if (seen.get(parts.slice(0, i).join("/")) === "file") throw new Error(`File tidak dapat berisi item lain: ${path}`);
    }
  }
  return items;
}

/** Parses both ASCII trees and the compact /Root, |-/folder, |-/file.ext notation. */
export function parseStructure(input: string): ParseResult {
  const errors: ParseResult["errors"] = [];
  const items: ParsedItem[] = [];
  const stack: { depth: number; path: string }[] = [];
  let rootName: string | null = null;
  for (const [index, raw] of input.split(/\r?\n/).entries()) {
    if (!raw.trim() || /^[\s│|]*$/.test(raw)) continue;
    // Only names ending with "/" are folders; brackets and other symbols are rejected.
    const withoutComment = raw.replace(/\/\.\s*$/, "/");
    const bad = withoutComment.replace(/^[\s│|├└+`─-]+/, "").replace(/^\|\s*-\s*\//, "");
    if (/[()[\]{}<>"'`*?|:;,=!#$%^&\\]/.test(bad)) {
      errors.push({ line: index + 1, text: raw, message: "Karakter tidak diterima (hanya nama, titik, -, _ dan /)." });
      continue;
    }
    // The branch marker is formatting, never part of a file name.
    const compactMatch = withoutComment.match(/^([ \t]*)\|\s*-\s*\/(.*)$/);
    const treeMatch = withoutComment.match(/^([ \t│|]*)([├└+`][-─ ]+)(.*)$/);
    const compact = !!compactMatch;
    let depth: number;
    let name: string;
    if (compact) {
      depth = 1;
      name = (compactMatch?.[2] ?? "").trim();
    } else if (treeMatch) {
      depth = Math.max(1, Math.round((treeMatch[1] ?? "").replace(/\t/g, "    ").length / 4) + 1);
      name = (treeMatch[3] ?? "").trim();
    } else {
      const matched = withoutComment.match(/^([ \t]*)(.*)$/);
      name = (matched?.[2] ?? withoutComment).trim();
      depth = Math.round((matched?.[1] ?? "").replace(/\t/g, "    ").length / 4);
    }
    if (!name) continue;
    // A leading "/" (e.g. "├── /web-pusat") marks a folder at any depth.
    const rootSlash = name.startsWith("/") && !name.startsWith("//");
    if (rootSlash) name = name.slice(1).trim();
    if (name.startsWith("./")) name = name.slice(2);
    const folder = rootSlash || name.endsWith("/") || (compact && !name.includes("."));
    const clean = name.replace(/\/$/, "").trim();
    if (!clean || clean.startsWith("/") || clean.includes("\\") || clean.split("/").some((s) => !s || s === "." || s === "..")) {
      errors.push({ line: index + 1, text: raw, message: "Nama atau jalur tidak valid." });
      continue;
    }
    while (stack.length && (stack[stack.length - 1]?.depth ?? -1) >= depth) stack.pop();
    const parent = stack[stack.length - 1]?.path ?? "";
    const path = parent ? `${parent}/${clean}` : clean;
    if (depth === 0 && folder && !rootName) rootName = clean;
    // Inline paths create their intermediate directories as well.
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/") + "/";
      if (!items.some((item) => item.path === dir)) items.push({ path: dir });
    }
    items.push({ path: folder ? path + "/" : path });
    if (folder) stack.push({ depth, path });
  }
  if (!items.length) errors.push({ line: 0, text: "", message: "Tidak ada file atau folder yang ditemukan." });
  return { items, rootName, errors };
}

export function stripRoot(items: ParsedItem[], rootName: string | null): ParsedItem[] {
  if (!rootName) return items;
  const prefix = rootName + "/";
  if (!items.every((i) => i.path === prefix || i.path.startsWith(prefix))) return items;
  return items.filter((i) => i.path !== prefix).map((i) => ({ path: i.path.slice(prefix.length) }));
}