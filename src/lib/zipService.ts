import JSZip from "jszip";
import { validatePaths } from "./structureParser";

export interface ZipProgress {
  processed: number;
  total: number;
  files: number;
  folders: number;
  phase: "collecting" | "zipping" | "reading" | "done";
}

export interface ZipEntry {
  path: string;
  content?: string;
}

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|bmp|mp3|wav|ogg|mp4|webm|mov|pdf|zip|gz|ttf|otf|woff2?|exe|bin|dat|wasm)$/i;
const BINARY_PREFIX = "__PROJECT_FORGE_BINARY_BASE64__:";

export function encodeBinary(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return BINARY_PREFIX + btoa(result);
}

export function isBinaryContent(content: string): boolean {
  return content.startsWith(BINARY_PREFIX);
}

export function binaryBlob(content: string): Blob {
  const raw = atob(content.slice(BINARY_PREFIX.length));
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  return new Blob([bytes]);
}

export async function readDeviceFile(file: File): Promise<string> {
  if (file.size > 50 * 1024 * 1024) throw new Error(`File terlalu besar (maksimum 50 MB): ${file.name}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (BINARY_EXT.test(file.name) || bytes.slice(0, 8192).includes(0)) return encodeBinary(bytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function buildZip(
  rootName: string,
  files: { path: string; content: string }[],
  folders: string[],
  onProgress: (p: ZipProgress) => void,
  shouldCancel: () => boolean,
): Promise<Blob | null> {
  const zip = new JSZip();
  const root = zip.folder(rootName) ?? zip;
  for (const f of folders) root.folder(f.replace(/\/$/, ""));
  const total = files.length;
  let processed = 0;
  const CHUNK = 200;
  for (let i = 0; i < total; i += CHUNK) {
    if (shouldCancel()) return null;
    for (const f of files.slice(i, i + CHUNK)) {
      root.file(f.path, isBinaryContent(f.content) ? f.content.slice(BINARY_PREFIX.length) : (f.content ?? ""), isBinaryContent(f.content) ? { base64: true } : {});
      processed++;
    }
    onProgress({
      processed,
      total,
      files: total,
      folders: folders.length,
      phase: "collecting",
    });
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress({ processed, total, files: total, folders: folders.length, phase: "zipping" });
  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => {
      if (Math.round(meta.percent) % 5 === 0)
        onProgress({
          processed: Math.round((meta.percent / 100) * total),
          total,
          files: total,
          folders: folders.length,
          phase: "zipping",
        });
    },
  );
  if (shouldCancel()) return null;
  onProgress({ processed: total, total, files: total, folders: folders.length, phase: "done" });
  return blob;
}

export async function readZip(
  file: File,
  onProgress: (p: ZipProgress) => void,
): Promise<{ items: ZipEntry[]; rootName: string | null }> {
  const zip = await JSZip.loadAsync(file);
  const all = Object.values(zip.files).filter((entry) => !entry.name.startsWith("__MACOSX/") && !entry.name.split("/").some((part) => part === ".DS_Store"));
  const fileEntries = all.filter((e) => !e.dir);
  const folderEntries = all.filter((e) => e.dir);
  const items: ZipEntry[] = [];
  let processed = 0;
  if (all.length > 20000) throw new Error("ZIP berisi terlalu banyak item (maksimum 20.000).");
  for (const dir of folderEntries) items.push({ path: dir.name.replace(/\/*$/, "/") });
  for (const entry of fileEntries) {
    if (((entry as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0) > 50 * 1024 * 1024)
      throw new Error(`File ZIP terlalu besar: ${entry.name}`);
    const bytes = await entry.async("uint8array");
    if (bytes.length > 50 * 1024 * 1024) throw new Error(`File ZIP terlalu besar: ${entry.name}`);
    const content = BINARY_EXT.test(entry.name) || bytes.slice(0, 8192).includes(0)
      ? encodeBinary(bytes)
      : new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    items.push({ path: entry.name, content });
    processed++;
    if (processed % 25 === 0) {
      onProgress({
        processed,
        total: fileEntries.length,
        files: fileEntries.length,
        folders: folderEntries.length,
        phase: "reading",
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress({
    processed: fileEntries.length,
    total: fileEntries.length,
    files: fileEntries.length,
    folders: folderEntries.length,
    phase: "done",
  });
  validatePaths(items);
  const roots = new Set(items.map((i) => i.path.split("/")[0]));
  const rootName = roots.size === 1 ? ([...roots][0] ?? null) : null;
  return { items, rootName };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text: string, filename: string) {
  downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
}
