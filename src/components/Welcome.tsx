import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { documentDir, join } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import { api, type ProjectInfo, type RecentProject } from "../api";
import { Button, Icon, IconButton, isMac } from "./ui";
import { AppIcon } from "./AppIcon";

interface WelcomeProps {
  onOpen: (project: ProjectInfo) => void;
  onOpenSettings: () => void;
}

function timeAgo(seconds: number) {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

function ActionRow({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass flex w-full cursor-default items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition-[background-color] hover:!bg-[var(--glass-strong)] active:brightness-95"
    >
      <span className="grid size-9 place-items-center rounded-full bg-selected text-fg">{icon}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted">{subtitle}</span>
      </span>
    </button>
  );
}

export default function Welcome({ onOpen, onOpenSettings }: WelcomeProps) {
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [targetPath, setTargetPath] = useState("");

  useEffect(() => {
    api.recentProjects().then(setRecent).catch((e) => setError(String(e)));
    documentDir().then(setLocation).catch(() => {});
    getVersion().then(setVersion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!location || !name.trim()) return setTargetPath("");
    join(location, name.trim()).then(setTargetPath);
  }, [location, name]);

  async function openPath(path: string) {
    setError(null);
    try {
      onOpen(await api.openProject(path));
    } catch (e) {
      setError(String(e));
    }
  }

  async function openFolder() {
    const path = await open({ directory: true, title: "Open a LaTeX project folder" });
    if (typeof path === "string") openPath(path);
  }

  async function chooseLocation() {
    const path = await open({ directory: true, title: "Choose where to create the project", defaultPath: location });
    if (typeof path === "string") setLocation(path);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      onOpen(await api.createProject(location, name));
    } catch (err) {
      setError(String(err));
    }
  }

  async function forget(path: string) {
    await api.forgetProject(path);
    setRecent((r) => r.filter((p) => p.path !== path));
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div data-tauri-drag-region className="flex h-[52px] shrink-0 items-center justify-end px-3">
          <IconButton onClick={onOpenSettings} title={`Settings (${isMac ? "⌘," : "Ctrl+,"})`}>
            <Icon className="size-4">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </Icon>
          </IconButton>
        </div>

        <div className="flex flex-1 flex-col items-center overflow-auto px-8 pb-10">
          <div className="mt-[6vh] flex flex-col items-center text-center">
            <AppIcon size={96} />
            <h1 className="mt-5 text-[34px] font-semibold tracking-tight">Lasty</h1>
            <p className="mt-1 text-muted">{version ? `Version ${version}` : " "}</p>
          </div>

          <div className="mt-10 w-full max-w-sm">
            {creating ? (
              <form onSubmit={create} className="glass space-y-4 rounded-[22px] p-5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted">Project name</span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="bachelor-thesis"
                    spellCheck={false}
                    className="h-8 w-full rounded-full border border-separator bg-control px-3.5 outline-none focus:ring-2 focus:ring-separator"
                  />
                </label>
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted">Location</span>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted" title={location}>
                      {location || "…"}
                    </span>
                    <Button type="button" onClick={chooseLocation}>
                      Change…
                    </Button>
                  </div>
                </div>
                {targetPath && (
                  <p className="text-xs text-muted">
                    Creates <span className="font-mono text-fg">{targetPath}</span> with a starter{" "}
                    <span className="font-mono text-fg">main.tex</span>.
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" disabled={!name.trim() || !location}>
                    Create
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-2.5">
                <ActionRow
                  onClick={() => setCreating(true)}
                  title="Create New Project…"
                  subtitle="Start a new folder with a main.tex"
                  icon={<Icon><path d="M12 5v14M5 12h14" /></Icon>}
                />
                <ActionRow
                  onClick={openFolder}
                  title="Open Existing Folder…"
                  subtitle="Work on LaTeX files you already have"
                  icon={<Icon><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Icon>}
                />
              </div>
            )}
            {error && <p className="mt-4 select-text text-xs text-bad">{error}</p>}
          </div>
        </div>
      </div>

      <aside className="my-2 mr-2 flex w-80 shrink-0 flex-col overflow-hidden rounded-[18px] bg-sheet shadow-[0_0_0_0.5px_var(--edge),0_1px_3px_var(--lift)] max-md:hidden">
        <h2 data-tauri-drag-region className="px-5 pb-2 pt-4 text-[11px] font-semibold text-muted">Recent</h2>
        {recent.length === 0 ? (
          <p className="px-5 text-muted">No recent projects.</p>
        ) : (
          <ul className="flex-1 overflow-auto px-2.5 pb-3">
            {recent.map((p) => (
              <li key={p.path} className="group relative">
                <button
                  className="flex w-full cursor-default items-center gap-3 rounded-[12px] px-2.5 py-2 text-left hover:bg-hover disabled:opacity-50"
                  disabled={!p.exists}
                  onClick={() => openPath(p.path)}
                  title={p.path}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-selected text-muted">
                    <Icon className="size-4">
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                      <path d="M14 3v5h5" />
                    </Icon>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {p.exists ? p.path : "Folder was moved or deleted"}
                    </span>
                  </span>
                  <span className="text-[11px] text-faint group-hover:invisible">{timeAgo(p.lastOpened)}</span>
                </button>
                <button
                  onClick={() => forget(p.path)}
                  title="Remove from Recent"
                  className="invisible absolute right-2 top-1/2 grid size-5 -translate-y-1/2 cursor-default place-items-center rounded-full bg-separator text-muted hover:text-fg group-hover:visible"
                >
                  <Icon className="size-3"><path d="M6 6l12 12M18 6L6 18" /></Icon>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
