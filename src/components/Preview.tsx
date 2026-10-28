import { useEffect, useState } from "react";
import type { Diagnostic } from "../editor/latexText";
import type { SyncTex } from "../editor/synctex";
import PdfViewer, { type PdfTarget } from "./PdfViewer";

interface PreviewProps {
  pdfBase64: string | null;
  synctex: SyncTex | null;
  target: PdfTarget | null;
  error: string | null;
  diagnostics: Diagnostic[];
  compiling: boolean;
  dark: boolean;
  onToggleDark: () => void;
  onExport: () => void;
  onJump: (file: string, line: number) => void;
}

const SLOW_MS = 4000;
const SLOW_HINT = "Downloading LaTeX packages. This happens only the first time a package is used.";

export default function Preview({
  pdfBase64,
  synctex,
  target,
  error,
  diagnostics,
  compiling,
  dark,
  onToggleDark,
  onExport,
  onJump,
}: PreviewProps) {
  const [logOpen, setLogOpen] = useState(true);
  const [rawOpen, setRawOpen] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!compiling) return setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [compiling]);

  useEffect(() => {
    if (error) setLogOpen(true);
  }, [error]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1">
        {pdfBase64 && slow && (
          <div className="glass absolute left-1/2 top-3 z-10 max-w-[90%] -translate-x-1/2 rounded-full px-4 py-1.5 text-center text-xs text-muted">
            {SLOW_HINT}
          </div>
        )}
        {pdfBase64 ? (
          <PdfViewer
            data={pdfBase64}
            synctex={synctex}
            target={target}
            dark={dark}
            dimmed={!!error}
            onInverse={onJump}
            onToggleDark={onToggleDark}
            onExport={onExport}
          />
        ) : (
          <div className="m-auto max-w-sm px-6 text-center text-muted">
            {error ? "Fix the error below to see your document." : "Typesetting…"}
            {!error && slow && <p className="mt-2 text-xs">{SLOW_HINT}</p>}
          </div>
        )}
      </div>
      {error && (
        <section className="flex max-h-[45%] shrink-0 flex-col border-t border-separator bg-sheet">
          <button
            onClick={() => setLogOpen((o) => !o)}
            className="flex cursor-default items-center gap-2 px-4 py-2 text-left"
          >
            <span className="size-2 rounded-full bg-bad" />
            <span className="font-semibold">Compilation failed</span>
            <span className="text-xs text-muted">
              {pdfBase64 ? "Showing the last good version · " : ""}
              {logOpen ? "Hide Log" : "Show Log"}
            </span>
          </button>
          {logOpen && (
            <div className="overflow-auto px-2 pb-3">
              {diagnostics.length > 0 && (
                <ul className="mb-2 space-y-0.5">
                  {diagnostics.map((d, i) => (
                    <li key={i}>
                      <button
                        onClick={() => onJump(d.file, d.line)}
                        title="Go to this line"
                        className="flex w-full cursor-default items-baseline gap-2 rounded-lg px-2 py-1 text-left hover:bg-hover"
                      >
                        <span className="shrink-0 font-mono text-[11px] text-muted">
                          {d.file}:{d.line}
                        </span>
                        <span className="min-w-0 text-[12.5px] text-bad">{d.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {diagnostics.length > 0 && (
                <button onClick={() => setRawOpen((o) => !o)} className="cursor-default px-2 text-xs text-muted hover:text-fg">
                  {rawOpen ? "Hide full log" : "Show full log"}
                </button>
              )}
              {(rawOpen || diagnostics.length === 0) && (
                <pre className="select-text whitespace-pre-wrap px-2 pt-2 font-mono text-[11.5px] leading-relaxed text-muted">
                  {error}
                </pre>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
