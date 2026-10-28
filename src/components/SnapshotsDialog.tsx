import { useEffect, useState } from "react";
import { api, type Snapshot } from "../api";
import { Button, Dialog } from "./ui";

function formatTime(ms: number) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function SnapshotsDialog({
  root,
  activeFile,
  onRestored,
  onClose,
}: {
  root: string;
  activeFile: string | null;
  onRestored: () => void;
  onClose: () => void;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.listSnapshots(root).then(setSnapshots).catch((e) => setError(String(e)));
  useEffect(() => void load(), [root]);

  useEffect(() => {
    setPreview(null);
    if (!selected || !activeFile) return;
    api.readSnapshotFile(root, selected, activeFile).then(setPreview).catch(() => setPreview(null));
  }, [selected, activeFile, root]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const create = () =>
    run(async () => {
      await api.createSnapshot(root, label.trim() || "Manual snapshot", false);
      setLabel("");
      await load();
    });

  const restore = (id: string) =>
    run(async () => {
      await api.restoreSnapshot(root, id);
      onRestored();
      onClose();
    });

  const remove = (id: string) =>
    run(async () => {
      await api.deleteSnapshot(root, id);
      if (selected === id) setSelected(null);
      await load();
    });

  return (
    <Dialog title="Version History" onClose={onClose} width={760}>
      <div className="flex min-h-0 flex-1 gap-3 px-5 pb-5" style={{ height: 460 }}>
        <div className="flex w-72 shrink-0 flex-col gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
            className="flex gap-1.5"
          >
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Name this version"
              className="h-8 min-w-0 flex-1 rounded-full border border-separator bg-control px-3 text-[13px] outline-none focus:ring-2 focus:ring-separator"
            />
            <Button type="submit" variant="primary" disabled={busy}>
              Save
            </Button>
          </form>
          <p className="px-1 text-[11px] text-muted">
            Text files are saved in <span className="font-mono">.lasty/snapshots</span> inside the project.
          </p>
          <ul className="min-h-0 flex-1 overflow-auto rounded-xl bg-sheet p-1 shadow-[0_0_0_0.5px_var(--edge)]">
            {snapshots?.length === 0 && <li className="px-3 py-2 text-muted">No versions saved yet.</li>}
            {snapshots?.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelected(s.id)}
                  className={`w-full cursor-default rounded-[10px] px-3 py-1.5 text-left ${selected === s.id ? "bg-selected" : "hover:bg-hover"}`}
                >
                  <span className="block truncate font-medium">{s.label}</span>
                  <span className="block text-[11px] text-muted">
                    {formatTime(s.created)} · {s.files} {s.files === 1 ? "file" : "files"}
                    {s.auto ? " · automatic" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-sheet shadow-[0_0_0_0.5px_var(--edge)]">
            {selected ? (
              preview !== null ? (
                <pre className="select-text whitespace-pre-wrap p-3 font-mono text-[11.5px] leading-relaxed">{preview}</pre>
              ) : (
                <p className="p-3 text-muted">{activeFile ? `${activeFile} is not part of this version.` : "Open a file to preview it."}</p>
              )
            ) : (
              <p className="p-3 text-muted">Select a version to preview {activeFile ?? "it"}.</p>
            )}
          </div>
          {error && <p className="select-text text-xs text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button disabled={!selected || busy} onClick={() => selected && remove(selected)}>
              Delete
            </Button>
            <Button variant="primary" disabled={!selected || busy} onClick={() => selected && restore(selected)}>
              Restore This Version
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
