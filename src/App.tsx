import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, type ProjectInfo } from "./api";
import SettingsDialog from "./components/SettingsDialog";
import Setup from "./components/Setup";
import UpdateButton from "./components/UpdateButton";
import Welcome from "./components/Welcome";
import Workspace from "./components/Workspace";
import { isMac } from "./components/ui";
import { SettingsProvider, useSettings } from "./settings";
import { applyThemeClasses } from "./theme";

if (isMac) document.documentElement.classList.add("native-glass");

function Shell() {
  const { settings } = useSettings();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [booting, setBooting] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme } = settings;

  useEffect(() => {
    applyThemeClasses(theme);
    getCurrentWindow().setTheme(theme === "light" ? "light" : "dark").catch(() => {});
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle("no-typing-animation", !settings.typingAnimation);
  }, [settings.typingAnimation]);

  useEffect(() => {
    if (!settings.reopenLastProject) return setBooting(false);
    api
      .lastProject()
      .then((path) => (path ? api.openProject(path) : null))
      .then(setProject)
      .catch(() => setProject(null))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        e.stopPropagation();
        setSettingsOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  async function close() {
    await api.closeProject();
    setProject(null);
  }

  if (booting) return null;
  if (!settings.setupDone) return <Setup />;

  const openSettings = () => setSettingsOpen(true);

  return (
    <>
      {project ? (
        <Workspace
          key={project.path}
          project={project}
          theme={theme}
          onOpenSettings={openSettings}
          onClose={close}
        />
      ) : (
        <Welcome onOpen={setProject} onOpenSettings={openSettings} />
      )}
      <UpdateButton />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export default function App() {
  return <SettingsProvider>{(loaded) => (loaded ? <Shell /> : null)}</SettingsProvider>;
}
