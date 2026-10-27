export type Status = "ready" | "compiling" | "success" | "error";

const LABELS: Record<Status, string> = {
  ready: "Ready",
  compiling: "Compiling…",
  success: "Success",
  error: "Error",
};

interface ToolbarProps {
  status: Status;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onCompile: () => void;
}

export default function Toolbar({ status, theme, onToggleTheme, onCompile }: ToolbarProps) {
  return (
    <header className="toolbar">
      <span className="title">Lasty</span>
      <span className={`status status-${status}`}>{LABELS[status]}</span>
      <div className="spacer" />
      <button onClick={onCompile}>Compile</button>
      <button onClick={onToggleTheme}>{theme === "dark" ? "Light" : "Dark"}</button>
    </header>
  );
}
