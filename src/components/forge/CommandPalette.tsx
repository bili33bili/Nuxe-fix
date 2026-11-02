import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  disabled?: boolean;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? commands.filter((c) =>
          `${c.label} ${c.group ?? ""} ${c.hint ?? ""}`.toLowerCase().includes(q),
        )
      : commands;
    return [...list].sort((a, b) => Number(!!a.disabled) - Number(!!b.disabled));
  }, [query, commands]);

  const step = (dir: 1 | -1) =>
    setIndex((i) => {
      for (let k = 1; k <= results.length; k++) {
        const next = (i + dir * k + results.length * k) % results.length;
        if (!results[next]?.disabled) return next;
      }
      return i;
    });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-lg overflow-hidden rounded-xl shadow-2xl animate-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Palet perintah"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                step(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                step(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const cmd = results[index] ?? results.find((c) => !c.disabled);
                if (cmd && !cmd.disabled) {
                  onClose();
                  cmd.run();
                }
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Ketik perintah…"
            aria-label="Perintah"
            className="w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul className="max-h-72 overflow-auto py-1" role="listbox">
          {results.length === 0 && (
            <li className="px-4 py-4 text-sm text-muted-foreground">Tidak ada perintah ditemukan.</li>
          )}
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                role="option"
                aria-selected={i === index}
                aria-disabled={c.disabled}
                disabled={c.disabled}
                onMouseEnter={() => !c.disabled && setIndex(i)}
                onClick={() => {
                  if (c.disabled) return;
                  onClose();
                  c.run();
                }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition ${
                  c.disabled
                    ? "cursor-not-allowed text-muted-foreground/40"
                    : i === index
                      ? "bg-[color:var(--row-active)] text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {c.group && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-70">
                      {c.group}
                    </span>
                  )}
                  <span className="truncate">{c.label}</span>
                </span>
                {c.hint && <span className="shrink-0 text-xs opacity-60">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
