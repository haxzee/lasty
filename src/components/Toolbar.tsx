import { useRef, useState } from "react";
import { Button, Icon, IconButton, isMac } from "./ui";

export type Status = "ready" | "compiling" | "success" | "error";

const STATUS: Record<Status, { label: string; dot: string; text: string }> = {
  ready: { label: "Ready", dot: "bg-faint", text: "text-muted" },
  compiling: { label: "Compiling…", dot: "bg-busy animate-pulse", text: "text-muted" },
  success: { label: "Compiled", dot: "bg-ok", text: "text-muted" },
  error: { label: "Error", dot: "bg-bad", text: "text-bad" },
};

interface ToolbarProps {
  openFiles: string[];
  activeFile: string | null;
  saved: boolean;
  status: Status;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onCompile: () => void;
  onSelectFile: (file: string) => void;
  onCloseFile: (file: string) => void;
  onReorder: (files: string[]) => void;
}

interface Drag {
  file: string;
  from: number;
  startX: number;
  dx: number;
  moved: boolean;
  /** Tab centers at drag start, relative to the pointer's starting x. */
  centers: number[];
  width: number;
}

function targetIndex(d: Drag) {
  const center = d.centers[d.from] + d.dx;
  let to = d.from;
  d.centers.forEach((c, i) => {
    if (i < d.from && center < c) to = Math.min(to, i);
    if (i > d.from && center > c) to = Math.max(to, i);
  });
  return to;
}

export default function Toolbar({
  openFiles,
  activeFile,
  saved,
  status,
  onOpenSettings,
  onOpenHistory,
  onCompile,
  onSelectFile,
  onCloseFile,
  onReorder,
}: ToolbarProps) {
  const s = STATUS[status];
  const [drag, setDrag] = useState<Drag | null>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const suppressClick = useRef(false);

  function onPointerDown(e: React.PointerEvent, file: string, index: number) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const centers = openFiles.map((f) => {
      const r = tabRefs.current.get(f)!.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    const width = tabRefs.current.get(file)!.getBoundingClientRect().width;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ file, from: index, startX: e.clientX, dx: 0, moved: false, centers, width });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < 4) return;
    setDrag({ ...drag, dx, moved: true });
  }

  function onPointerUp() {
    if (!drag) return;
    if (drag.moved) {
      suppressClick.current = true;
      const to = targetIndex(drag);
      if (to !== drag.from) {
        const next = [...openFiles];
        next.splice(to, 0, ...next.splice(drag.from, 1));
        onReorder(next);
      }
    }
    setDrag(null);
  }

  const to = drag?.moved ? targetIndex(drag) : -1;
  const gap = (drag?.width ?? 0) + 2;

  return (
    <header
      data-tauri-drag-region
      className={`flex h-[52px] shrink-0 items-center gap-2 pr-2 ${isMac ? "max-md:pl-20" : ""}`}
    >
      {openFiles.length ? (
        <div
          role="tablist"
          className="glass flex h-8 min-w-0 items-center gap-0.5 overflow-x-auto rounded-full p-0.5 [scrollbar-width:none]"
        >
          {openFiles.map((file, i) => {
            const active = file === activeFile;
            const dragging = drag?.moved && drag.file === file;
            let shift = 0;
            if (drag?.moved && !dragging) {
              if (i > drag.from && i <= to) shift = -gap;
              if (i < drag.from && i >= to) shift = gap;
            }
            return (
              <div
                key={file}
                ref={(el) => {
                  if (el) tabRefs.current.set(file, el);
                  else tabRefs.current.delete(file);
                }}
                role="tab"
                aria-selected={active}
                title={file}
                onPointerDown={(e) => onPointerDown(e, file, i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                onClick={() => {
                  if (suppressClick.current) return void (suppressClick.current = false);
                  onSelectFile(file);
                }}
                onAuxClick={(e) => e.button === 1 && onCloseFile(file)}
                style={{ transform: `translateX(${dragging ? drag.dx : shift}px)` }}
                className={`group relative flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-full pl-3 pr-1 ${
                  dragging ? "z-10 shadow-[0_2px_8px_rgb(0_0_0/0.18)]" : "transition-[transform,background-color,color] duration-200 ease-[cubic-bezier(.2,.8,.2,1)]"
                } ${active || dragging ? "bg-control text-fg shadow-[0_0.5px_2px_rgb(0_0_0/0.2)]" : "text-muted hover:bg-hover hover:text-fg"}`}
              >
                <span className="max-w-40 truncate font-medium">{file.split("/").pop()}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseFile(file);
                  }}
                  title={`Close (${isMac ? "⌘W" : "Ctrl+W"})`}
                  aria-label={`Close ${file}`}
                  className="grid size-5 cursor-default place-items-center rounded-full hover:bg-hover"
                >
                  {active && !saved ? <span className="size-1.5 rounded-full bg-current group-hover:hidden" /> : null}
                  <Icon className={`size-3 ${active && !saved ? "hidden group-hover:block" : active ? "" : "opacity-0 group-hover:opacity-100"}`}>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </Icon>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass flex h-8 min-w-0 items-center rounded-full px-3.5 text-muted">No file open</div>
      )}

      <div data-tauri-drag-region className="h-full flex-1" />

      <div role="status" className={`glass flex h-8 items-center gap-1.5 rounded-full px-3 text-xs ${s.text}`}>
        <span className={`size-2 rounded-full ${s.dot}`} />
        {s.label}
      </div>
      <IconButton onClick={onOpenHistory} title="Version History">
        <Icon className="size-4">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5M12 7v5l3 2" />
        </Icon>
      </IconButton>
      <IconButton onClick={onOpenSettings} title={`Settings (${isMac ? "⌘," : "Ctrl+,"})`}>
        <Icon className="size-4">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </Icon>
      </IconButton>
      <Button variant="primary" onClick={onCompile} title={`Compile (${isMac ? "⌘S" : "Ctrl+S"})`}>
        <Icon className="size-3">
          <path d="M7 4v16l13-8z" fill="currentColor" />
        </Icon>
        Compile
      </Button>
    </header>
  );
}
