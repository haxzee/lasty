import { useState } from "react";
import { Button, Dialog } from "./ui";

/** Puts each field of a one-line BibTeX entry on its own line. */
export function formatBibtex(entry: string) {
  const text = entry.trim();
  const open = text.indexOf("{");
  if (!text.startsWith("@") || open < 0) return text;
  const fields: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        fields.push(text.slice(start, i));
        break;
      }
    } else if (c === "," && depth === 1) {
      fields.push(text.slice(start, i));
      start = i + 1;
    }
  }
  const [key, ...rest] = fields.map((f) => f.trim()).filter(Boolean);
  const pairs = rest.map((f) => {
    const eq = f.indexOf("=");
    return [f.slice(0, eq).trim().toLowerCase(), f.slice(eq + 1).trim()] as const;
  });
  const width = Math.max(0, ...pairs.map(([k]) => k.length));
  return `${text.slice(0, open)}{${key},\n${pairs.map(([k, v]) => `  ${k.padEnd(width)} = ${v}`).join(",\n")}\n}\n`;
}

export function bibKey(entry: string) {
  return entry.match(/@\w+\s*\{\s*([^,\s]+)/)?.[1] ?? null;
}

function cleanDoi(input: string) {
  return input.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
}

export default function DoiDialog({
  bibFiles,
  onAdd,
  onClose,
}: {
  bibFiles: string[];
  onAdd: (bibFile: string, entry: string, cite: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [doi, setDoi] = useState("");
  const [entry, setEntry] = useState<string | null>(null);
  const [target, setTarget] = useState(bibFiles[0] ?? "references.bib");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const id = cleanDoi(doi);
    if (!id) return;
    setLoading(true);
    setError(null);
    setEntry(null);
    try {
      const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(id)}/transform/application/x-bibtex`);
      if (res.status === 404) throw new Error("No publication found for this DOI.");
      if (!res.ok) throw new Error(`Lookup failed (HTTP ${res.status}).`);
      setEntry(formatBibtex(await res.text()));
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach doi.org. Check your internet connection." : String((err as Error).message ?? err));
    } finally {
      setLoading(false);
    }
  }

  async function add(cite: boolean) {
    if (!entry) return;
    try {
      await onAdd(target, entry, cite);
      onClose();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Dialog title="Add Reference from DOI" onClose={onClose} width={560}>
      <div className="space-y-3 px-5 pb-5">
        <form onSubmit={lookup} className="flex gap-2">
          <input
            autoFocus
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            placeholder="10.1145/359576.359579 or https://doi.org/…"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 rounded-full border border-separator bg-control px-3.5 outline-none focus:ring-2 focus:ring-separator"
          />
          <Button type="submit" variant="primary" disabled={!doi.trim() || loading}>
            {loading ? "Looking up…" : "Look Up"}
          </Button>
        </form>
        {error && <p className="select-text text-xs text-bad">{error}</p>}
        {entry !== null && (
          <>
            <textarea
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              spellCheck={false}
              rows={10}
              className="w-full resize-none rounded-xl border border-separator bg-sheet p-3 font-mono text-[11.5px] leading-relaxed outline-none"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Add to</span>
              <input
                list="bib-files"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                spellCheck={false}
                className="h-7 w-44 rounded-full border border-separator bg-control px-3 text-xs outline-none"
              />
              <datalist id="bib-files">
                {bibFiles.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <span className="flex-1" />
              <Button onClick={() => add(false)} disabled={!target.endsWith(".bib")}>
                Add
              </Button>
              <Button variant="primary" onClick={() => add(true)} disabled={!target.endsWith(".bib")} title={`Also insert \\cite{${bibKey(entry) ?? "…"}}`}>
                Add & Cite
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
