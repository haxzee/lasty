import { useMemo, useRef, useState } from "react";
import { isEditable, type FileEntry } from "../api";
import { ContextMenu, Icon, IconButton, type MenuEntry } from "./ui";

interface FileTreeProps {
  files: FileEntry[];
  activeFile: string | null;
  mainFile: string;
  onOpen: (path: string) => void;
  onSetMain: (path: string) => void;
  onCreate: (path: string) => Promise<void>;
  onCreateFolder: (path: string) => Promise<void>;
  onRename: (from: string, to: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
  onReveal: (path: string) => void;
  onRefresh: () => void;
}

type Edit =
  | { kind: "file" | "folder"; dir: string; value: string }
  | { kind: "rename"; path: string; value: string };

function FileIcon({ name }: { name: string }) {
  const tex = name.endsWith(".tex");
  return (
    <Icon className={`size-3.5 shrink-0 ${tex ? "text-fg/70" : "text-muted"}`}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Icon>
  );
}

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

export default function FileTree({
  files,
  activeFile,
  mainFile,
  onOpen,
  onSetMain,
  onCreate,
  onCreateFolder,
  onRename,
  onDelete,
  onReveal,
  onRefresh,
}: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
  const [dropDir, setDropDir] = useState<string | null>(null);
  // Enter submits and the following blur must not submit the same edit again.
  const editOpen = useRef(false);

  function begin(next: Edit) {
    editOpen.current = true;
    setError(null);
    setEdit(next);
  }

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

  function startNew(kind: "file" | "folder", dir = "") {
    begin({ kind, dir, value: "" });
    if (dir) setCollapsed((prev) => new Set([...prev].filter((d) => d !== dir)));
  }

  async function submit() {
    if (!edit || !editOpen.current) return;
    editOpen.current = false;
    const value = edit.value.trim();
    try {
      if (edit.kind === "rename") {
        const to = join(parentOf(edit.path), value);
        if (value && to !== edit.path) await onRename(edit.path, to);
      } else if (value) {
        const path = join(edit.dir, value);
        if (edit.kind === "folder") await onCreateFolder(path);
        else await onCreate(value.includes(".") ? path : `${path}.tex`);
      }
      setEdit(null);
      setError(null);
    } catch (err) {
      editOpen.current = true;
      setError(String(err));
    }
  }

  function openMenu(e: React.MouseEvent, f: FileEntry | null) {
    e.preventDefault();
    e.stopPropagation();
    const dir = f ? (f.isDir ? f.path : parentOf(f.path)) : "";
    const items: MenuEntry[] = [
      { label: "New File…", onSelect: () => startNew("file", dir) },
      { label: "New Folder…", onSelect: () => startNew("folder", dir) },
    ];
    if (f) {
      items.push("separator");
      if (!f.isDir && f.path.endsWith(".tex") && f.path !== mainFile) {
        items.push({ label: "Set as Main File", onSelect: () => onSetMain(f.path) });
      }
      items.push(
        { label: "Rename…", onSelect: () => begin({ kind: "rename", path: f.path, value: f.name }) },
        { label: "Reveal in Finder", onSelect: () => onReveal(f.path) },
        "separator",
        { label: "Move to Trash", danger: true, onSelect: () => onDelete(f.path).catch((err) => setError(String(err))) },
      );
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  function onDragStart(e: React.DragEvent, f: FileEntry) {
    e.dataTransfer.setData("application/x-lasty-path", f.path);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent, dir: string) {
    if (!e.dataTransfer.types.includes("application/x-lasty-path")) return;
    e.preventDefault();
    e.stopPropagation();
    setDropDir(dir);
  }

  async function onDrop(e: React.DragEvent, dir: string) {
    const from = e.dataTransfer.getData("application/x-lasty-path");
    setDropDir(null);
    if (!from) return;
    e.preventDefault();
    e.stopPropagation();
    const to = join(dir, from.split("/").pop()!);
    if (to === from || dir === from || dir.startsWith(from + "/")) return;
    try {
      await onRename(from, to);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  const input = (indent: number, placeholder: string) =>
    edit && (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="py-0.5"
        style={{ paddingLeft: indent }}
      >
        <input
          autoFocus
          value={edit.value}
          placeholder={placeholder}
          spellCheck={false}
          onFocus={(e) => {
            const dot = e.target.value.lastIndexOf(".");
            e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
          }}
          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
          onBlur={() => {
            if (edit.value.trim()) submit();
            else {
              editOpen.current = false;
              setEdit(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            editOpen.current = false;
            setEdit(null);
          }}
          className="h-7 w-full rounded-[10px] border border-separator bg-control px-2 text-[13px] outline-none ring-2 ring-separator"
        />
      </form>
    );

  const depthOf = (dir: string) => (dir ? dir.split("/").length : 0);
  const newInputAt = edit && edit.kind !== "rename" ? edit.dir : null;

  return (
    <nav aria-label="Project files" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-0.5 pb-1 pl-5 pr-2.5">
        <span className="flex-1 text-[11px] font-semibold text-muted">Files</span>
        <IconButton className="!size-7" onClick={() => startNew("file")} title="New File">
          <Icon className="size-3.5"><path d="M12 5v14M5 12h14" /></Icon>
        </IconButton>
        <IconButton className="!size-7" onClick={() => startNew("folder")} title="New Folder">
          <Icon className="size-3.5">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v5M9.5 13.5h5" />
          </Icon>
        </IconButton>
        <IconButton className="!size-7" onClick={onRefresh} title="Reload Files">
          <Icon className="size-3.5"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></Icon>
        </IconButton>
      </div>
      {error && <p className="select-text px-5 pb-1 text-[11px] text-bad">{error}</p>}

      <ul
        className={`flex-1 overflow-auto px-2.5 pb-14 ${dropDir === "" ? "bg-hover" : ""}`}
        onContextMenu={(e) => openMenu(e, null)}
        onDragOver={(e) => onDragOver(e, "")}
        onDragLeave={() => setDropDir(null)}
        onDrop={(e) => onDrop(e, "")}
      >
        {newInputAt === "" && <li>{input(8, edit?.kind === "folder" ? "folder name" : "chapters/intro.tex")}</li>}
        {visible.map((f) => {
          const editable = !f.isDir && isEditable(f.path);
          const isMain = f.path === mainFile;
          const active = f.path === activeFile;
          const indent = 8 + f.depth * 14;
          if (edit?.kind === "rename" && edit.path === f.path) {
            return <li key={f.path}>{input(indent + (f.isDir ? 0 : 18), f.name)}</li>;
          }
          return (
            <li key={f.path} className="group relative">
              {f.isDir ? (
                <button
                  draggable
                  onDragStart={(e) => onDragStart(e, f)}
                  onDragOver={(e) => onDragOver(e, f.path)}
                  onDrop={(e) => onDrop(e, f.path)}
                  onClick={() => toggle(f.path)}
                  onContextMenu={(e) => openMenu(e, f)}
                  style={{ paddingLeft: indent }}
                  className={`flex h-7 w-full cursor-default items-center gap-1.5 rounded-[10px] pr-2 text-left ${
                    dropDir === f.path ? "bg-selected ring-2 ring-separator" : "hover:bg-hover"
                  }`}
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
                  draggable
                  onDragStart={(e) => onDragStart(e, f)}
                  onDragOver={(e) => onDragOver(e, parentOf(f.path))}
                  onDrop={(e) => onDrop(e, parentOf(f.path))}
                  disabled={!editable}
                  onClick={() => onOpen(f.path)}
                  onContextMenu={(e) => openMenu(e, f)}
                  style={{ paddingLeft: indent + 18 }}
                  title={editable ? f.path : `${f.path} (can't be edited here)`}
                  className={`flex h-7 w-full cursor-default items-center gap-1.5 rounded-[10px] pr-2 text-left disabled:opacity-45 ${
                    active ? "bg-selected font-medium" : "hover:bg-hover"
                  }`}
                >
                  <FileIcon name={f.name} />
                  <span className="flex-1 truncate">{f.name}</span>
                  {isMain && (
                    <span title="This file gets compiled" className="text-[10px] font-medium text-muted">
                      Main
                    </span>
                  )}
                </button>
              )}
              {!isMain && f.path.endsWith(".tex") && (
                <button
                  onClick={() => onSetMain(f.path)}
                  title="Compile this file instead"
                  className="invisible absolute right-1.5 top-1/2 -translate-y-1/2 cursor-default rounded bg-separator px-1.5 py-0.5 text-[10px] font-medium text-muted hover:text-fg group-hover:visible"
                >
                  Set as Main
                </button>
              )}
              {f.isDir && newInputAt === f.path && !collapsed.has(f.path) && (
                <div>{input(8 + depthOf(f.path) * 14 + 18, edit?.kind === "folder" ? "folder name" : "file.tex")}</div>
              )}
            </li>
          );
        })}
      </ul>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </nav>
  );
}
