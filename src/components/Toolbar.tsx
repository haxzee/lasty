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
  onCompile: () => void;
  onSelectFile: (file: string) => void;
  onCloseFile: (file: string) => void;
}

export default function Toolbar({
  openFiles,
  activeFile,
  saved,
  status,
  onOpenSettings,
  onCompile,
  onSelectFile,
  onCloseFile,
}: ToolbarProps) {
  const s = STATUS[status];
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
          {openFiles.map((file) => {
            const active = file === activeFile;
            return (
              <div
                key={file}
                role="tab"
                aria-selected={active}
                title={file}
                onClick={() => onSelectFile(file)}
                onAuxClick={(e) => e.button === 1 && onCloseFile(file)}
                className={`group flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-full pl-3 pr-1 transition-colors duration-150 ${
                  active ? "bg-control text-fg shadow-[0_0.5px_2px_rgb(0_0_0/0.2)]" : "text-muted hover:bg-hover hover:text-fg"
                }`}
              >
                <span className="max-w-40 truncate font-medium">{file.split("/").pop()}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseFile(file);
                  }}
                  title="Close"
                  aria-label={`Close ${file}`}
                  className="grid size-5 cursor-default place-items-center rounded-full hover:bg-hover"
                >
                  {active && !saved ? (
                    <span className="size-1.5 rounded-full bg-current group-hover:hidden" />
                  ) : null}
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
