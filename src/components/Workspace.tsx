import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, isEditable, type ProjectInfo } from "../api";
import { extractCitationKeys, extractLabels, setProjectSymbols, type monaco } from "../editor/monaco";
import { parseDiagnostics, wordCount, type Diagnostic } from "../editor/latexText";
import { SyncTex } from "../editor/synctex";
import { useSettings } from "../settings";
import DoiDialog, { bibKey } from "./DoiDialog";
import Editor, { type Jump } from "./Editor";
import FileTree from "./FileTree";
import type { PdfTarget } from "./PdfViewer";
import Preview from "./Preview";
import QuickOpen from "./QuickOpen";
import { OutlinePanel, SearchPanel } from "./SidebarPanels";
import SnapshotsDialog from "./SnapshotsDialog";
import Toolbar, { type Status } from "./Toolbar";
import { Icon, IconButton, isMac, type Theme } from "./ui";

const SPLIT_KEY = "lasty.split";
const DEFAULT_FONT_SIZE = 13;
const POLL_MS = 2000;
const AUTO_SNAPSHOT_MS = 10 * 60 * 1000;
const IMAGE_EXT = /\.(png|jpe?g|pdf|eps|svg|gif)$/i;

type SidebarTab = "files" | "outline" | "search";

interface WorkspaceProps {
  project: ProjectInfo;
  theme: Theme;
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

function readTabs(root: string): { open: string[]; active: string | null } | null {
  try {
    return JSON.parse(localStorage.getItem(`lasty.tabs:${root}`) ?? "null");
  } catch {
    return null;
  }
}

function figureSnippet(path: string) {
  const name = path.split("/").pop()!.replace(/\.[^.]+$/, "");
  const label = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${path}}\n  \\caption{}\n  \\label{fig:${label}}\n\\end{figure}\n`;
}

export default function Workspace({ project, theme, onOpenSettings, onClose }: WorkspaceProps) {
  const root = project.path;
  const [files, setFiles] = useState(project.files);
  const [mainFile, setMainFile] = useState(project.mainFile);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(true);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [pdf, setPdf] = useState<string | null>(null);
  const [synctex, setSynctex] = useState<SyncTex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [status, setStatus] = useState<Status>("ready");
  const [split, setSplit] = useState(readSplit);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  const [searchFocus, setSearchFocus] = useState(0);
  const [jump, setJump] = useState<Jump | null>(null);
  const [pdfTarget, setPdfTarget] = useState<PdfTarget | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [quickOpen, setQuickOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [doiOpen, setDoiOpen] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
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
  const activeRef = useRef(activeFile);
  activeRef.current = activeFile;
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const editorSection = useRef<HTMLElement>(null);
  const jumpSeq = useRef(0);
  const lastSaved = useRef<string>("");
  const knownMtime = useRef(0);
  const lastAutoSnapshot = useRef(0);
  const editedSinceSnapshot = useRef(false);

  const indexFile = useCallback((file: string, text: string) => {
    setTexts((prev) => (prev[file] === text ? prev : { ...prev, [file]: text }));
  }, []);

  useEffect(() => {
    const entries = Object.entries(texts);
    setProjectSymbols(
      entries.filter(([f]) => f.endsWith(".tex")).flatMap(([, t]) => extractLabels(t)),
      entries.filter(([f]) => f.endsWith(".bib")).flatMap(([, t]) => extractCitationKeys(t)),
    );
  }, [texts]);

  const readAllTexts = useCallback(
    async (list = files) => {
      const editable = list.filter((f) => !f.isDir && isEditable(f.path));
      const results = await Promise.all(
        editable.map((f) => api.readFile(root, f.path).then((t) => [f.path, t] as const).catch(() => null)),
      );
      setTexts(Object.fromEntries(results.filter((r) => r !== null)));
    },
    [root, files],
  );

  const autoSnapshot = useCallback(() => {
    if (!settingsRef.current.autoSnapshots || !editedSinceSnapshot.current) return;
    if (Date.now() - lastAutoSnapshot.current < AUTO_SNAPSHOT_MS) return;
    lastAutoSnapshot.current = Date.now();
    editedSinceSnapshot.current = false;
    api.createSnapshot(root, "Automatic snapshot", true).catch(() => {});
  }, [root]);

  const compile = useCallback(async () => {
    const id = ++requestId.current;
    setStatus("compiling");
    try {
      const result = await api.compile(root, mainRef.current, settingsRef.current.engine);
      if (id !== requestId.current) return;
      setPdf(result.pdf);
      setSynctex(result.synctex ? new SyncTex(result.synctex, root) : null);
      setError(null);
      setDiagnostics([]);
      setStatus("success");
      autoSnapshot();
    } catch (e) {
      if (id !== requestId.current) return;
      setError(String(e));
      setDiagnostics(parseDiagnostics(String(e), root));
      setStatus("error");
    }
  }, [root, autoSnapshot]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return false;
    pending.current = null;
    try {
      if (p.file === activeRef.current) lastSaved.current = p.content;
      await api.writeFile(root, p.file, p.content);
      if (p.file === activeRef.current) knownMtime.current = await api.fileModified(root, p.file).catch(() => 0);
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
    async (file: string, target: Omit<Jump, "seq"> | null = null) => {
      if (file === activeRef.current) {
        if (target) setJump({ ...target, seq: ++jumpSeq.current });
        return;
      }
      await flush();
      try {
        const text = await api.readFile(root, file);
        lastSaved.current = text;
        knownMtime.current = await api.fileModified(root, file).catch(() => 0);
        setContent(text);
        setActiveFile(file);
        activeRef.current = file;
        setJump(target ? { ...target, seq: ++jumpSeq.current } : null);
        setOpenFiles((open) => (open.includes(file) ? open : [...open, file]));
        setRecentFiles((r) => [file, ...r.filter((f) => f !== file)].slice(0, 20));
        setSaved(true);
        setExternalChange(false);
        setCursorLine(target?.line ?? 1);
      } catch (e) {
        setError(String(e));
      }
    },
    [root, flush],
  );

  const jumpTo = useCallback(
    (file: string, line: number, column?: number) => {
      if (!isEditable(file)) return;
      openFile(file, { line, column });
    },
    [openFile],
  );

  useEffect(() => {
    const saved = readTabs(root);
    const exists = (f: string) => files.some((e) => e.path === f && isEditable(f));
    const restore = saved?.open.filter(exists) ?? [];
    const first = saved?.active && exists(saved.active) ? saved.active : exists(mainFile) ? mainFile : restore[0] ?? files.find((f) => isEditable(f.path))?.path;
    setOpenFiles(restore);
    if (first) openFile(first);
    compile();
    readAllTexts();
  }, [root]);

  useEffect(() => {
    try {
      localStorage.setItem(`lasty.tabs:${root}`, JSON.stringify({ open: openFiles, active: activeFile }));
    } catch {}
  }, [root, openFiles, activeFile]);

  useEffect(() => () => void flush(), [flush]);

  function handleChange(value: string) {
    if (!activeFile) return;
    setContent(value);
    setSaved(false);
    editedSinceSnapshot.current = true;
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

  async function closeFile(file: string) {
    const index = openFiles.indexOf(file);
    const rest = openFiles.filter((f) => f !== file);
    if (file === activeFile) {
      const next = rest[Math.min(index, rest.length - 1)];
      if (next) await openFile(next);
      else {
        await flush();
        setActiveFile(null);
        activeRef.current = null;
        setContent("");
      }
    }
    setOpenFiles(rest);
  }
  const closeRef = useRef(closeFile);
  closeRef.current = closeFile;

  // Edits made outside Lasty: reload silently when there are no unsaved changes, otherwise ask.
  const checkExternal = useCallback(async () => {
    const file = activeRef.current;
    if (!file) return;
    const mtime = await api.fileModified(root, file).catch(() => 0);
    if (!mtime || mtime === knownMtime.current || file !== activeRef.current) return;
    const text = await api.readFile(root, file).catch(() => null);
    if (text === null || file !== activeRef.current) return;
    knownMtime.current = mtime;
    if (text === lastSaved.current) return;
    if (pending.current) return setExternalChange(true);
    lastSaved.current = text;
    setContent(text);
    indexFile(file, text);
    if (settingsRef.current.autoCompile) compile();
  }, [root, indexFile, compile]);

  async function reloadFromDisk() {
    const file = activeRef.current;
    if (!file) return;
    clearTimeout(timer.current);
    pending.current = null;
    const text = await api.readFile(root, file);
    lastSaved.current = text;
    setContent(text);
    setSaved(true);
    setExternalChange(false);
    indexFile(file, text);
  }

  useEffect(() => {
    const interval = window.setInterval(checkExternal, POLL_MS);
    const onFocus = () => {
      checkExternal();
      readAllTexts();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkExternal, readAllTexts]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "s") compileNow();
      else if (key === "p" && !e.shiftKey) setQuickOpen((o) => !o);
      else if (key === "f" && e.shiftKey) {
        setSidebarTab("search");
        setSearchFocus((n) => n + 1);
      } else if (key === "w" && !isMac && activeRef.current) closeRef.current(activeRef.current);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [compileNow]);

  useEffect(() => {
    const unlisten = listen<string>("menu", (e) => {
      if (e.payload === "close-tab" && activeRef.current) closeRef.current(activeRef.current);
    });
    return () => void unlisten.then((f) => f());
  }, []);

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
    const list = await api.listFiles(root);
    setFiles(list);
    setOpenFiles((open) => open.filter((f) => list.some((l) => l.path === f)));
    readAllTexts(list);
    return list;
  }, [root, readAllTexts]);

  // Files dragged in from Finder / Explorer get copied into the project.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent(async (event) => {
      const p = event.payload;
      if (p.type === "enter" || p.type === "over") return setDropActive(true);
      if (p.type === "leave") return setDropActive(false);
      setDropActive(false);
      if (!p.paths.length) return;
      const images = p.paths.filter((s) => IMAGE_EXT.test(s));
      const others = p.paths.filter((s) => !IMAGE_EXT.test(s));
      try {
        const imported = [
          ...(images.length ? await api.importFiles(root, images, "images") : []),
          ...(others.length ? await api.importFiles(root, others, "") : []),
        ];
        await refreshFiles();
        const rect = editorSection.current?.getBoundingClientRect();
        const x = p.position.x / devicePixelRatio;
        const y = p.position.y / devicePixelRatio;
        const overEditor = rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        const editor = editorRef.current;
        const figures = imported.filter((f) => IMAGE_EXT.test(f));
        if (overEditor && editor && figures.length && activeRef.current?.endsWith(".tex")) {
          const target = editor.getTargetAtClientPoint(x, y)?.position ?? editor.getPosition();
          if (target) {
            const at = { startLineNumber: target.lineNumber, startColumn: 1, endLineNumber: target.lineNumber, endColumn: 1 };
            editor.executeEdits("drop", [{ range: at, text: figures.map(figureSnippet).join("\n") }]);
            editor.focus();
          }
        } else if (imported.length === 1 && isEditable(imported[0])) openFile(imported[0]);
      } catch (e) {
        setError(String(e));
      }
    });
    return () => void unlisten.then((f) => f());
  }, [root, refreshFiles, openFile]);

  async function createFile(path: string) {
    await api.createFile(root, path);
    await refreshFiles();
    await openFile(path);
  }

  async function createFolder(path: string) {
    await api.createFolder(root, path);
    await refreshFiles();
  }

  const remap = (path: string, from: string, to: string) =>
    path === from ? to : path.startsWith(from + "/") ? to + path.slice(from.length) : path;

  async function renamePath(from: string, to: string) {
    await flush();
    await api.renamePath(root, from, to);
    const nextActive = activeFile && remap(activeFile, from, to);
    setOpenFiles((open) => open.map((f) => remap(f, from, to)));
    if (nextActive !== activeFile) {
      setActiveFile(nextActive);
      activeRef.current = nextActive;
    }
    const nextMain = remap(mainFile, from, to);
    if (nextMain !== mainFile) await setMain(nextMain, false);
    await refreshFiles();
  }

  async function deletePath(path: string) {
    const ok = await ask(`“${path}” will be moved to the Trash.`, { title: "Move to Trash?", kind: "warning", okLabel: "Move to Trash" });
    if (!ok) return;
    const gone = (f: string) => f === path || f.startsWith(path + "/");
    if (pending.current && gone(pending.current.file)) {
      clearTimeout(timer.current);
      pending.current = null;
    }
    await api.deletePath(root, path);
    if (activeFile && gone(activeFile)) {
      setActiveFile(null);
      activeRef.current = null;
      setContent("");
      setSaved(true);
    }
    setOpenFiles((open) => open.filter((f) => !gone(f)));
    await refreshFiles();
  }

  async function reveal(path: string) {
    revealItemInDir(await join(root, path)).catch((e) => setError(String(e)));
  }

  async function setMain(path: string, recompile = true) {
    await api.setMainFile(root, path);
    setMainFile(path);
    mainRef.current = path;
    if (recompile) compileNow();
  }

  function showInPdf(line: number) {
    const file = activeRef.current;
    if (!synctex || !file) return;
    const target = synctex.forward(file, line);
    if (target) setPdfTarget({ ...target, seq: Date.now() });
  }

  async function exportPdf() {
    if (!pdf) return;
    const defaultPath = await join(root, mainFile.replace(/\.tex$/, "") + ".pdf");
    const dest = await save({ defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!dest) return;
    try {
      await api.exportPdf(dest, pdf);
      revealItemInDir(dest).catch(() => {});
    } catch (e) {
      setError(String(e));
    }
  }

  async function replaceAll(re: RegExp, replacement: string) {
    await flush();
    let count = 0;
    for (const [file, text] of Object.entries(texts)) {
      const matches = text.match(re)?.length ?? 0;
      if (!matches) continue;
      count += matches;
      const next = text.replace(re, replacement);
      const model = editorRef.current?.getModel();
      if (file === activeRef.current && model) {
        editorRef.current!.pushUndoStop();
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text: next }], () => null);
        editorRef.current!.pushUndoStop();
      } else {
        await api.writeFile(root, file, next);
        indexFile(file, next);
      }
    }
    if (count) compileNow();
    return count;
  }

  async function addReference(bibFile: string, entry: string, cite: boolean) {
    const exists = files.some((f) => f.path === bibFile);
    const current = exists ? (bibFile === activeFile ? content : await api.readFile(root, bibFile)) : "";
    const next = current.trimEnd() + (current.trim() ? "\n\n" : "") + entry;
    if (bibFile === activeFile && editorRef.current?.getModel()) {
      const model = editorRef.current.getModel()!;
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: next }], () => null);
    } else {
      await api.writeFile(root, bibFile, next);
      indexFile(bibFile, next);
      if (!exists) await refreshFiles();
    }
    const key = bibKey(entry);
    const editor = editorRef.current;
    if (cite && key && editor && activeFile?.endsWith(".tex")) {
      const sel = editor.getSelection();
      if (sel) editor.executeEdits("cite", [{ range: sel, text: `\\cite{${key}}` }]);
      editor.focus();
    }
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

  const liveTexts = useMemo(
    () => (activeFile && activeFile in texts ? { ...texts, [activeFile]: content } : texts),
    [texts, activeFile, content],
  );
  const deferredTexts = useDeferredValue(liveTexts);
  const deferredContent = useDeferredValue(content);
  const words = useMemo(() => (activeFile?.endsWith(".tex") ? wordCount(deferredContent) : null), [deferredContent, activeFile]);
  const bibFiles = useMemo(() => files.filter((f) => f.path.endsWith(".bib")).map((f) => f.path), [files]);
  const fileDiagnostics = useMemo(() => diagnostics.filter((d) => d.file === activeFile), [diagnostics, activeFile]);

  const onEditorReady = useCallback((editor: monaco.editor.IStandaloneCodeEditor | null) => {
    editorRef.current = editor;
    editor?.onDidChangeCursorPosition((e) => setCursorLine(e.position.lineNumber));
  }, []);

  const tabButton = (tab: SidebarTab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setSidebarTab(tab)}
      title={label}
      aria-pressed={sidebarTab === tab}
      className={`flex h-7 flex-1 cursor-default items-center justify-center rounded-full text-xs font-medium transition-colors ${
        sidebarTab === tab ? "bg-control text-fg shadow-[0_0.5px_2px_rgb(0_0_0/0.2)]" : "text-muted hover:text-fg"
      }`}
    >
      <Icon className="size-3.5">{icon}</Icon>
      <span className="sr-only">{label}</span>
    </button>
  );

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col animate-[step-back_500ms_cubic-bezier(.2,.8,.2,1)_both] max-md:hidden">
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
        <div className="mx-2.5 mb-2 flex rounded-full bg-hover p-0.5">
          {tabButton("files", "Files", <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />)}
          {tabButton("outline", "Outline", <path d="M4 6h16M8 12h12M12 18h8" />)}
          {tabButton("search", `Search (${isMac ? "⌘⇧F" : "Ctrl+Shift+F"})`, <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>)}
        </div>
        {sidebarTab === "files" && (
          <FileTree
            files={files}
            activeFile={activeFile}
            mainFile={mainFile}
            onOpen={openFile}
            onSetMain={setMain}
            onCreate={createFile}
            onCreateFolder={createFolder}
            onRename={renamePath}
            onDelete={deletePath}
            onReveal={reveal}
            onRefresh={refreshFiles}
          />
        )}
        {sidebarTab === "outline" && (
          <OutlinePanel texts={deferredTexts} mainFile={mainFile} activeFile={activeFile} cursorLine={cursorLine} onJump={jumpTo} />
        )}
        {sidebarTab === "search" && (
          <SearchPanel texts={deferredTexts} focusSeq={searchFocus} onJump={jumpTo} onReplaceAll={replaceAll} />
        )}
        <div className="px-2.5 pb-2.5">
          <button
            onClick={() => setDoiOpen(true)}
            className="flex h-7 w-full cursor-default items-center gap-2 rounded-[10px] px-2.5 text-xs text-muted hover:bg-hover hover:text-fg"
          >
            <Icon className="size-3.5">
              <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 7h6" />
            </Icon>
            Add Reference from DOI…
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-2 pr-2 max-md:pl-2">
        <Toolbar
          openFiles={openFiles}
          activeFile={activeFile}
          saved={saved}
          status={status}
          onOpenSettings={onOpenSettings}
          onOpenHistory={() => setHistoryOpen(true)}
          onCompile={compileNow}
          onSelectFile={(f) => f !== activeFile && openFile(f)}
          onCloseFile={closeFile}
          onReorder={setOpenFiles}
        />
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `${split}fr 8px ${100 - split}fr` }}>
          <section
            ref={editorSection}
            style={{ animation: "rise-in 550ms 80ms cubic-bezier(.2,.8,.2,1) both" }}
            className={`relative flex min-w-0 flex-col overflow-hidden rounded-[14px] bg-sheet shadow-[0_0_0_0.5px_var(--edge),0_1px_3px_var(--lift)] transition-shadow ${
              dropActive ? "shadow-[0_0_0_2px_var(--accent)]" : ""
            }`}
          >
            {externalChange && (
              <div className="flex shrink-0 items-center gap-2 border-b border-separator px-4 py-2 text-xs">
                <span className="size-2 rounded-full bg-busy" />
                <span className="flex-1">This file was changed outside Lasty.</span>
                <button onClick={reloadFromDisk} className="cursor-default rounded-full px-2.5 py-1 font-medium hover:bg-hover">
                  Reload
                </button>
                <button onClick={() => setExternalChange(false)} className="cursor-default rounded-full px-2.5 py-1 text-muted hover:bg-hover">
                  Keep Mine
                </button>
              </div>
            )}
            <div
              aria-live="polite"
              className={`glass pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs tabular-nums transition-opacity duration-300 ${
                zoomHint ? "opacity-100" : "opacity-0"
              }`}
            >
              {Math.round((fontSize / DEFAULT_FONT_SIZE) * 100)} %
            </div>
            {words !== null && (
              <div className="pointer-events-none absolute bottom-2 right-4 z-10 text-[11px] tabular-nums text-faint">
                {words.toLocaleString()} {words === 1 ? "word" : "words"}
              </div>
            )}
            <div className="min-h-0 flex-1">
              {activeFile ? (
                <Editor
                  key={activeFile}
                  file={activeFile}
                  value={content}
                  onChange={handleChange}
                  onSave={compileNow}
                  onShowInPdf={showInPdf}
                  onReady={onEditorReady}
                  diagnostics={fileDiagnostics}
                  jump={jump}
                  theme={theme}
                />
              ) : (
                <div className="grid h-full place-items-center text-muted">
                  Select a file in the sidebar, or press {isMac ? "⌘P" : "Ctrl+P"}.
                </div>
              )}
            </div>
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
          <section style={{ animation: "rise-in 550ms 160ms cubic-bezier(.2,.8,.2,1) both" }} className="min-w-0 overflow-hidden rounded-[14px] bg-sheet shadow-[0_0_0_0.5px_var(--edge),0_1px_3px_var(--lift)]">
            <Preview
              pdfBase64={pdf}
              synctex={synctex}
              target={pdfTarget}
              error={error}
              diagnostics={diagnostics}
              compiling={status === "compiling"}
              dark={settings.pdfDarkMode}
              onToggleDark={() => update({ pdfDarkMode: !settings.pdfDarkMode })}
              onExport={exportPdf}
              onJump={jumpTo}
            />
          </section>
        </div>
      </div>

      {quickOpen && <QuickOpen files={files} recent={recentFiles} onOpen={(f) => openFile(f)} onClose={() => setQuickOpen(false)} />}
      {historyOpen && (
        <SnapshotsDialog
          root={root}
          activeFile={activeFile}
          onClose={() => setHistoryOpen(false)}
          onRestored={async () => {
            await refreshFiles();
            const file = activeRef.current;
            if (file) {
              const text = await api.readFile(root, file);
              lastSaved.current = text;
              setContent(text);
              setSaved(true);
            }
            compile();
          }}
        />
      )}
      {doiOpen && <DoiDialog bibFiles={bibFiles} onAdd={addReference} onClose={() => setDoiOpen(false)} />}
    </div>
  );
}
