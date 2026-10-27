import { useCallback, useEffect, useRef, useState } from "react";
import { api, isEditable, type ProjectInfo } from "../api";
import { extractCitationKeys, extractLabels, setProjectSymbols } from "../editor/monaco";
import Editor from "./Editor";
import FileTree from "./FileTree";
import Preview from "./Preview";
import Toolbar, { type Status } from "./Toolbar";
import { Icon, IconButton, type Theme } from "./ui";
import { useSettings } from "../settings";

const SPLIT_KEY = "lasty.split";
const DEFAULT_FONT_SIZE = 13;

interface WorkspaceProps {
  project: ProjectInfo;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

function readSplit() {
  try {
    return Number(localStorage.getItem(SPLIT_KEY)) || 50;
  } catch {
    return 50;
  }
}

export default function Workspace({ project, theme, onThemeChange, onOpenSettings, onClose }: WorkspaceProps) {
  const root = project.path;
  const [files, setFiles] = useState(project.files);
  const [mainFile, setMainFile] = useState(project.mainFile);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(true);
  const [pdf, setPdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [split, setSplit] = useState(readSplit);
  const { settings, update } = useSettings();
  const fontSize = settings.editorFontSize;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [zoomHint, setZoomHint] = useState(false);
  const zoomTimer = useRef<number | undefined>(undefined);

  const requestId = useRef(0);
  const pending = useRef<{ file: string; content: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const mainRef = useRef(mainFile);
  mainRef.current = mainFile;

  const symbols = useRef(new Map<string, { labels: string[]; citations: string[] }>());
  const indexFile = useCallback((file: string, text: string) => {
    if (file.endsWith(".tex")) symbols.current.set(file, { labels: extractLabels(text), citations: [] });
    else if (file.endsWith(".bib")) symbols.current.set(file, { labels: [], citations: extractCitationKeys(text) });
    else return;
    const all = [...symbols.current.values()];
    setProjectSymbols(all.flatMap((s) => s.labels), all.flatMap((s) => s.citations));
  }, []);

  const compile = useCallback(async () => {
    const id = ++requestId.current;
    setStatus("compiling");
    try {
      const result = await api.compile(root, mainRef.current, settingsRef.current.engine);
      if (id !== requestId.current) return;
      setPdf(result);
      setError(null);
      setStatus("success");
    } catch (e) {
      if (id !== requestId.current) return;
      setError(String(e));
      setStatus("error");
    }
  }, [root]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return false;
    pending.current = null;
    try {
      await api.writeFile(root, p.file, p.content);
      indexFile(p.file, p.content);
      if (!pending.current) setSaved(true);
      return true;
    } catch (e) {
      setError(String(e));
      setStatus("error");
      return false;
    }
  }, [root, indexFile]);

  const openFile = useCallback(
    async (file: string) => {
      await flush();
      try {
        setContent(await api.readFile(root, file));
        setActiveFile(file);
        setSaved(true);
      } catch (e) {
        setError(String(e));
      }
    },
    [root, flush],
  );

  useEffect(() => {
    const first = files.some((f) => f.path === mainFile) ? mainFile : files.find((f) => isEditable(f.path))?.path;
    if (first) openFile(first);
    compile();
    symbols.current.clear();
    setProjectSymbols([], []);
    for (const f of files) {
      if (f.path.endsWith(".tex") || f.path.endsWith(".bib")) {
        api.readFile(root, f.path).then((text) => indexFile(f.path, text)).catch(() => {});
      }
    }
  }, [root]);

  useEffect(() => () => void flush(), [flush]);

  function handleChange(value: string) {
    if (!activeFile) return;
    setContent(value);
    setSaved(false);
    pending.current = { file: activeFile, content: value };
    clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      if ((await flush()) && settingsRef.current.autoCompile) compile();
    }, settingsRef.current.compileDelay);
  }

  const compileNow = useCallback(async () => {
    await flush();
    compile();
  }, [flush, compile]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        compileNow();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compileNow]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const delta = e.key === "+" || e.key === "=" ? 1 : e.key === "-" ? -1 : e.key === "0" ? 0 : null;
      if (delta === null) return;
      e.preventDefault();
      e.stopPropagation();
      const size = settingsRef.current.editorFontSize;
      update({ editorFontSize: delta === 0 ? DEFAULT_FONT_SIZE : Math.min(32, Math.max(9, size + delta)) });
      setZoomHint(true);
      clearTimeout(zoomTimer.current);
      zoomTimer.current = window.setTimeout(() => setZoomHint(false), 1000);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [update]);

  const engineMounted = useRef(false);
  useEffect(() => {
    if (engineMounted.current) compileNow();
    engineMounted.current = true;
  }, [settings.engine]);

  const refreshFiles = useCallback(async () => {
    setFiles(await api.listFiles(root));
  }, [root]);

  async function createFile(path: string) {
    await api.createFile(root, path);
    await refreshFiles();
    await openFile(path);
  }

  async function setMain(path: string) {
    await api.setMainFile(root, path);
    setMainFile(path);
    mainRef.current = path;
    compileNow();
  }

  function startDrag(e: React.PointerEvent) {
    const container = (e.currentTarget as HTMLElement).parentElement!;
    const rect = container.getBoundingClientRect();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add("dragging");
    const move = (ev: PointerEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplit(Math.min(80, Math.max(20, pct)));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      document.body.classList.remove("dragging");
      setSplit((s) => {
        try {
          localStorage.setItem(SPLIT_KEY, String(Math.round(s)));
        } catch {}
        return s;
      });
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up, { once: true });
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col max-md:hidden">
        <div data-tauri-drag-region className="h-[52px] shrink-0" />
        <div className="flex items-center gap-1 pb-3 pl-5 pr-2">
          <div className="min-w-0 flex-1" title={root}>
            <div className="truncate text-[15px] font-semibold">{project.name}</div>
            <div className="truncate text-[11px] text-muted">{root}</div>
          </div>
          <IconButton onClick={onClose} title="Close Project">
            <Icon className="size-3.5"><path d="M6 6l12 12M18 6L6 18" /></Icon>
          </IconButton>
        </div>
        <FileTree
          files={files}
          activeFile={activeFile}
          mainFile={mainFile}
          onOpen={openFile}
          onSetMain={setMain}
          onCreate={createFile}
          onRefresh={refreshFiles}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-2 pr-2 max-md:pl-2">
        <Toolbar
          activeFile={activeFile}
          saved={saved}
          status={status}
          theme={theme}
          onThemeChange={onThemeChange}
          onOpenSettings={onOpenSettings}
          onCompile={compileNow}
        />
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `${split}fr 8px ${100 - split}fr` }}>
          <section className="relative min-w-0 overflow-hidden rounded-[14px] bg-sheet shadow-[0_0_0_0.5px_var(--edge),0_1px_3px_var(--lift)]">
            <div
              aria-live="polite"
              className={`glass pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs tabular-nums transition-opacity duration-300 ${
                zoomHint ? "opacity-100" : "opacity-0"
              }`}
            >
              {Math.round((fontSize / DEFAULT_FONT_SIZE) * 100)} %
            </div>
            {activeFile ? (
              <Editor
                key={activeFile}
                file={activeFile}
                value={content}
                onChange={handleChange}
                onSave={compileNow}
                theme={theme}
              />
            ) : (
              <div className="grid h-full place-items-center text-muted">Select a file in the sidebar.</div>
            )}
          </section>
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={startDrag}
            onDoubleClick={() => setSplit(50)}
            className="group flex cursor-col-resize items-center justify-center"
          >
            <div className="h-8 w-[3px] rounded-full bg-faint opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <section className="min-w-0 overflow-hidden rounded-[14px] bg-sheet shadow-[0_0_0_0.5px_var(--edge),0_1px_3px_var(--lift)]">
            <Preview pdfBase64={pdf} error={error} compiling={status === "compiling"} />
          </section>
        </div>
      </div>
    </div>
  );
}
