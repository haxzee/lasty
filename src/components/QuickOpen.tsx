import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { isEditable, type FileEntry } from "../api";

/** Subsequence match score: higher is better, null when `query` isn't contained in order. */
function score(path: string, query: string) {
  const p = path.toLowerCase();
  const q = query.toLowerCase();
  let s = 0;
  let last = -1;
  for (const ch of q) {
    const i = p.indexOf(ch, last + 1);
    if (i < 0) return null;
    s += i === last + 1 ? 3 : 1;
    if (i === 0 || "/._-".includes(p[i - 1])) s += 2;
    last = i;
  }
  const name = p.slice(p.lastIndexOf("/") + 1);
  if (name.startsWith(q)) s += 10;
  return s - p.length * 0.01;
}

export default function QuickOpen({
  files,
  recent,
  onOpen,
  onClose,
}: {
  files: FileEntry[];
  recent: string[];
  onOpen: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const results = useMemo(() => {
    const editable = files.filter((f) => !f.isDir && isEditable(f.path)).map((f) => f.path);
    if (!query) {
      return [...recent.filter((r) => editable.includes(r)), ...editable.filter((f) => !recent.includes(f))].slice(0, 50);
    }
    return editable
      .map((path) => ({ path, s: score(path, query) }))
      .filter((r): r is { path: string; s: number } => r.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map((r) => r.path);
  }, [files, recent, query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") setIndex((i) => Math.min(results.length - 1, i + 1));
    else if (e.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" && results[index]) {
      onOpen(results[index]);
      onClose();
    } else if (e.key === "Escape") onClose();
    else return;
    e.preventDefault();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center bg-black/10 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass flex h-fit max-h-[60vh] w-[min(520px,90vw)] flex-col overflow-hidden rounded-[18px] !bg-[var(--glass-strong)] animate-[dialog-in_180ms_cubic-bezier(.2,.9,.3,1.1)]">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Go to file…"
          spellCheck={false}
          className="h-12 shrink-0 border-b border-separator bg-transparent px-4 text-[15px] outline-none"
        />
        <ul className="overflow-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-2 text-muted">No matching files.</li>}
          {results.map((path, i) => {
            const slash = path.lastIndexOf("/");
            return (
              <li key={path}>
                <button
                  onMouseMove={() => setIndex(i)}
                  onClick={() => {
                    onOpen(path);
                    onClose();
                  }}
                  className={`flex h-8 w-full cursor-default items-baseline gap-2 rounded-[10px] px-3 text-left leading-8 ${
                    i === index ? "bg-accent text-on-accent" : ""
                  }`}
                >
                  <span className="font-medium">{path.slice(slash + 1)}</span>
                  {slash > 0 && <span className={`truncate text-xs ${i === index ? "opacity-70" : "text-muted"}`}>{path.slice(0, slash)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
