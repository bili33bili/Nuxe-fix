export type NodeType = "file" | "folder";

export interface ProjectNode {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  type: NodeType;
  content?: string | undefined;
  size?: number | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  storageType: "local";
}

export interface ProjectStats {
  files: number;
  folders: number;
  totalSize: number;
}

export interface OpenTab {
  id: string;
  dirty: boolean;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export function uid(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
  );
}

export function byteSize(text: string | undefined): number {
  if (!text) return 0;
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
