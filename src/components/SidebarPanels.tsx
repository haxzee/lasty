import { useEffect, useMemo, useRef, useState } from "react";
import { projectOutline, searchRegex, searchTexts, type ProjectHeading } from "../editor/latexText";
import { Button, Icon } from "./ui";

export function OutlinePanel({
  texts,
  mainFile,
  activeFile,
  cursorLine,
  onJump,
}: {
  texts: Record<string, string>;
  mainFile: string;
  activeFile: string | null;
  cursorLine: number;
  onJump: (file: string, line: number) => void;
}) {
  const headings = useMemo(() => {
    const fromMain = projectOutline(mainFile, texts);
    // Files that aren't reachable from the main file still get an outline of their own.
    if (activeFile && activeFile.endsWith(".tex") && !fromMain.some((h) => h.file === activeFile)) {
      return projectOutline(activeFile, texts);
    }
    return fromMain;
  }, [texts, mainFile, activeFile]);

  const current = useMemo(() => {
    let found: ProjectHeading | null = null;
    for (const h of headings) if (h.file === activeFile && h.line <= cursorLine) found = h;
    return found;
  }, [headings, activeFile, cursorLine]);

  if (!headings.length) {
    return <p className="px-5 py-2 text-xs text-muted">No sections yet. Add {"\\section{…}"} to see the outline.</p>;
  }
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <ul className="flex-1 overflow-auto px-2.5 pb-14">
      {headings.map((h, i) => (
        <li key={i}>
          <button
            onClick={() => onJump(h.file, h.line)}
            title={`${h.file}:${h.line}`}
            style={{ paddingLeft: 10 + (h.level - minLevel) * 14 }}
            className={`flex h-7 w-full cursor-default items-center gap-1.5 rounded-[10px] pr-2 text-left ${
              h === current ? "bg-selected font-medium" : "hover:bg-hover"
            } ${h.level <= minLevel ? "font-medium" : "text-fg/85"}`}
          >
            <span className="truncate">{h.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SearchPanel({
  texts,
  focusSeq,
  onJump,
  onReplaceAll,
}: {
  texts: Record<string, string>;
  focusSeq: number;
  onJump: (file: string, line: number, column: number) => void;
  onReplaceAll: (re: RegExp, replacement: string) => Promise<number>;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSeq]);

  const re = useMemo(() => searchRegex(query, { regex, caseSensitive }), [query, regex, caseSensitive]);
  const matches = useMemo(() => (re ? searchTexts(texts, re) : []), [texts, re]);
  const byFile = useMemo(() => {
    const groups = new Map<string, typeof matches>();
    for (const m of matches) groups.set(m.file, [...(groups.get(m.file) ?? []), m]);
    return [...groups];
  }, [matches]);

  async function replaceAll() {
    if (!re) return;
    const count = await onReplaceAll(re, replacement);
    setStatus(`Replaced ${count} ${count === 1 ? "match" : "matches"}.`);
  }

  const toggle = (on: boolean, label: string, title: string, set: (v: boolean) => void) => (
    <button
      onClick={() => set(!on)}
      title={title}
      aria-pressed={on}
      className={`h-6 min-w-6 cursor-default rounded-md px-1 font-mono text-[11px] ${on ? "bg-accent text-on-accent" : "text-muted hover:bg-hover"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 px-2.5 pb-2">
        <div className="flex items-center gap-1 rounded-[10px] border border-separator bg-control pl-1 pr-1">
          <button
            onClick={() => setShowReplace((v) => !v)}
            title="Toggle Replace"
            className="grid size-6 cursor-default place-items-center rounded-md text-muted hover:bg-hover"
          >
            <Icon className={`size-3 transition-transform ${showReplace ? "rotate-90" : ""}`}>
              <path d="M9 6l6 6-6 6" />
            </Icon>
          </button>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setStatus(null);
            }}
            placeholder="Search project"
            spellCheck={false}
            className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
          {toggle(caseSensitive, "Aa", "Match Case", setCaseSensitive)}
          {toggle(regex, ".*", "Use Regular Expression", setRegex)}
        </div>
        {showReplace && (
          <div className="flex items-center gap-1.5">
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="Replace"
              spellCheck={false}
              className="h-7 min-w-0 flex-1 rounded-[10px] border border-separator bg-control px-2 text-[13px] outline-none"
            />
            <Button className="!h-7 !px-3 text-xs" disabled={!matches.length} onClick={replaceAll}>
              All
            </Button>
          </div>
        )}
        <p className="px-1 text-[11px] text-muted">
          {status ??
            (query && !re
              ? "Invalid regular expression"
              : query
                ? `${matches.length} ${matches.length === 1 ? "result" : "results"} in ${byFile.length} ${byFile.length === 1 ? "file" : "files"}`
                : " ")}
        </p>
      </div>
      <ul className="flex-1 overflow-auto px-2.5 pb-14">
        {byFile.map(([file, list]) => (
          <li key={file} className="mb-1.5">
            <div className="truncate px-2 py-1 text-[11px] font-semibold text-muted">{file}</div>
            {list.map((m, i) => {
              const start = Math.max(0, m.column - 1 - 24);
              const before = m.preview.slice(start, m.column - 1);
              const hit = m.preview.slice(m.column - 1, m.column - 1 + m.length);
              const after = m.preview.slice(m.column - 1 + m.length, m.column - 1 + m.length + 60);
              return (
                <button
                  key={i}
                  onClick={() => onJump(m.file, m.line, m.column)}
                  className="flex w-full cursor-default items-baseline gap-2 rounded-[8px] px-2 py-0.5 text-left hover:bg-hover"
                >
                  <span className="w-7 shrink-0 text-right font-mono text-[10.5px] text-faint">{m.line}</span>
                  <span className="truncate font-mono text-[11.5px] text-muted">
                    {start > 0 && "…"}
                    {before.trimStart()}
                    <mark className="rounded-[3px] bg-[#ffd84d]/50 text-fg">{hit}</mark>
                    {after}
                  </span>
                </button>
              );
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
