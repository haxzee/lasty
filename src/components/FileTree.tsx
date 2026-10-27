import { useMemo, useState } from "react";
import { isEditable, type FileEntry } from "../api";
import { Icon, IconButton } from "./ui";

interface FileTreeProps {
  files: FileEntry[];
  activeFile: string | null;
  mainFile: string;
  onOpen: (path: string) => void;
  onSetMain: (path: string) => void;
  onCreate: (path: string) => Promise<void>;
  onRefresh: () => void;
}

function FileIcon({ name }: { name: string }) {
  const tex = name.endsWith(".tex");
  return (
    <Icon className={`size-3.5 shrink-0 ${tex ? "text-fg/70" : "text-muted"}`}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Icon>
  );
}

export default function FileTree({ files, activeFile, mainFile, onOpen, onSetMain, onCreate, onRefresh }: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => files.filter((f) => ![...collapsed].some((dir) => f.path.startsWith(dir + "/"))),
    [files, collapsed],
  );

  function toggle(dir: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(dir) ? next.delete(dir) : next.add(dir);
      return next;
    });
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!newName?.trim()) return setNewName(null);
    const name = newName.includes(".") ? newName.trim() : `${newName.trim()}.tex`;
    try {
      await onCreate(name);
      setNewName(null);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <nav aria-label="Project files" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-0.5 pl-5 pr-2.5 pb-1">
        <span className="flex-1 text-[11px] font-semibold text-muted">Files</span>
        <IconButton className="!size-7" onClick={() => setNewName("")} title="New File">
          <Icon className="size-3.5"><path d="M12 5v14M5 12h14" /></Icon>
        </IconButton>
        <IconButton className="!size-7" onClick={onRefresh} title="Reload Files">
          <Icon className="size-3.5"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></Icon>
        </IconButton>
      </div>

      {newName !== null && (
        <form onSubmit={submitNew} className="px-2.5 pb-1">
          <input
            autoFocus
            value={newName}
            placeholder="chapters/intro.tex"
            spellCheck={false}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => !newName && setNewName(null)}
            onKeyDown={(e) => e.key === "Escape" && setNewName(null)}
            className="h-7 w-full rounded-full border border-separator bg-control px-2 text-xs outline-none ring-2 ring-separator"
          />
          {error && <p className="mt-1 select-text text-[11px] text-bad">{error}</p>}
        </form>
      )}

      <ul className="flex-1 overflow-auto px-2.5 pb-14">
        {visible.map((f) => {
          const editable = !f.isDir && isEditable(f.path);
          const isMain = f.path === mainFile;
          const active = f.path === activeFile;
          const indent = { paddingLeft: 8 + f.depth * 14 };
          return (
            <li key={f.path} className="group relative">
              {f.isDir ? (
                <button
                  onClick={() => toggle(f.path)}
                  style={indent}
                  className="flex h-7 w-full cursor-default items-center gap-1.5 rounded-[10px] pr-2 text-left hover:bg-hover"
                >
                  <Icon className={`size-3 shrink-0 text-muted transition-transform ${collapsed.has(f.path) ? "" : "rotate-90"}`}>
                    <path d="M9 6l6 6-6 6" />
                  </Icon>
                  <Icon className="size-3.5 shrink-0 text-muted">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </Icon>
                  <span className="truncate">{f.name}</span>
                </button>
              ) : (
                <button
                  disabled={!editable}
                  onClick={() => onOpen(f.path)}
                  style={{ paddingLeft: indent.paddingLeft + 18 }}
                  title={editable ? f.path : `${f.path} (can't be edited here)`}
                  className={`flex h-7 w-full cursor-default items-center gap-1.5 rounded-[10px] pr-2 text-left disabled:opacity-45 ${
                    active ? "bg-selected font-medium" : "hover:bg-hover"
                  }`}
                >
                  <FileIcon name={f.name} />
                  <span className="flex-1 truncate">{f.name}</span>
                  {isMain && (
                    <span
                      title="This file gets compiled"
                      className={`text-[10px] font-medium ${"text-muted"}`}
                    >
                      Main
                    </span>
                  )}
                </button>
              )}
              {!isMain && f.path.endsWith(".tex") && (
                <button
                  onClick={() => onSetMain(f.path)}
                  title="Compile this file instead"
                  className={`invisible absolute right-1.5 top-1/2 -translate-y-1/2 cursor-default rounded px-1.5 py-0.5 text-[10px] font-medium group-hover:visible ${
                    "bg-separator text-muted hover:text-fg"
                  }`}
                >
                  Set as Main
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
