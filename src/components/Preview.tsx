import { useEffect, useState } from "react";

interface PreviewProps {
  pdfBase64: string | null;
  error: string | null;
  compiling: boolean;
}

const SLOW_MS = 4000;
const SLOW_HINT = "Downloading LaTeX packages. This happens only the first time a package is used.";

export default function Preview({ pdfBase64, error, compiling }: PreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(true);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!compiling) return setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [compiling]);

  useEffect(() => {
    if (!pdfBase64) return;
    const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    const next = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [pdfBase64]);

  useEffect(() => {
    if (error) setLogOpen(true);
  }, [error]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1">
        {url && slow && (
          <div className="glass absolute bottom-3 left-1/2 z-10 max-w-[90%] -translate-x-1/2 rounded-full px-4 py-1.5 text-center text-xs text-muted">
            {SLOW_HINT}
          </div>
        )}
        {url ? (
          <iframe title="PDF preview" src={url} className={`flex-1 border-0 ${error ? "opacity-40" : ""}`} />
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
              {url ? "Showing the last good version · " : ""}
              {logOpen ? "Hide Log" : "Show Log"}
            </span>
          </button>
          {logOpen && (
            <pre className="select-text overflow-auto whitespace-pre-wrap px-4 pb-4 font-mono text-[11.5px] leading-relaxed text-muted">
              {error}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
