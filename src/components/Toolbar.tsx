import { Button, Icon, IconButton, ThemePicker, isMac, type Theme } from "./ui";

export type Status = "ready" | "compiling" | "success" | "error";

const STATUS: Record<Status, { label: string; dot: string; text: string }> = {
  ready: { label: "Ready", dot: "bg-faint", text: "text-muted" },
  compiling: { label: "Compiling…", dot: "bg-busy animate-pulse", text: "text-muted" },
  success: { label: "Compiled", dot: "bg-ok", text: "text-muted" },
  error: { label: "Error", dot: "bg-bad", text: "text-bad" },
};

interface ToolbarProps {
  activeFile: string | null;
  saved: boolean;
  status: Status;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onOpenSettings: () => void;
  onCompile: () => void;
}

export default function Toolbar({ activeFile, saved, status, theme, onThemeChange, onOpenSettings, onCompile }: ToolbarProps) {
  const s = STATUS[status];
  return (
    <header
      data-tauri-drag-region
      className={`flex h-[52px] shrink-0 items-center gap-2 pr-2 ${isMac ? "max-md:pl-20" : ""}`}
    >
      <div className="glass flex h-8 min-w-0 items-center gap-2 rounded-full px-3.5">
        <Icon className="size-3.5 shrink-0 text-muted">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </Icon>
        <span className="truncate font-medium">{activeFile ?? "No file open"}</span>
        {!saved && <span className="text-xs text-muted">Edited</span>}
      </div>

      <div data-tauri-drag-region className="h-full flex-1" />

      <div role="status" className={`glass flex h-8 items-center gap-1.5 rounded-full px-3 text-xs ${s.text}`}>
        <span className={`size-2 rounded-full ${s.dot}`} />
        {s.label}
      </div>
      <ThemePicker theme={theme} onChange={onThemeChange} />
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
