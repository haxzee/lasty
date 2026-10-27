import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettings } from "../settings";
import { checkForUpdate, type Update } from "../updates";
import { Icon } from "./ui";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DISMISSED_KEY = "lasty.dismissedUpdate";

function dismissedVersion() {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export default function UpdateButton() {
  const { settings } = useSettings();
  const [update, setUpdate] = useState<Update | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!settings.checkForUpdates) return setUpdate(null);
    const run = () =>
      checkForUpdate()
        .then((u) => setUpdate(u && u.version !== dismissedVersion() ? u : null))
        .catch(() => {});
    run();
    const timer = window.setInterval(run, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [settings.checkForUpdates]);

  if (!update) return null;

  function download() {
    openUrl(update!.downloadUrl).catch(() => openUrl(update!.releaseUrl));
    setStarted(true);
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, update!.version);
    } catch {}
    setUpdate(null);
  }

  return (
    <div className="glass fixed bottom-3 left-3 z-40 flex h-9 max-w-[216px] items-center rounded-full pl-1 pr-1 animate-[dialog-in_260ms_cubic-bezier(.2,.9,.3,1.1)]">
      <button
        onClick={download}
        title={`Download Lasty ${update.version}`}
        className="flex h-7 min-w-0 cursor-default items-center gap-2 rounded-full pl-1.5 pr-2.5 hover:bg-hover"
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
          <Icon className="size-3">
            <path d="M12 5v12M6 11l6 6 6-6" />
          </Icon>
        </span>
        <span className="truncate text-xs font-medium">
          {started ? "Download started" : `Update to ${update.version}`}
        </span>
      </button>
      <button
        onClick={dismiss}
        title="Hide until the next version"
        className="grid size-6 shrink-0 cursor-default place-items-center rounded-full text-muted hover:bg-hover hover:text-fg"
      >
        <Icon className="size-3">
          <path d="M6 6l12 12M18 6L6 18" />
        </Icon>
      </button>
    </div>
  );
}
