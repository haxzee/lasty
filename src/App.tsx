import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, type ProjectInfo } from "./api";
import SettingsDialog from "./components/SettingsDialog";
import UpdateButton from "./components/UpdateButton";
import Welcome from "./components/Welcome";
import Workspace from "./components/Workspace";
import { isMac, type Theme } from "./components/ui";
import { SettingsProvider, useSettings } from "./settings";

if (isMac) document.documentElement.classList.add("native-glass");

function Shell() {
  const { settings, update } = useSettings();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [booting, setBooting] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme } = settings;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme !== "light");
    root.classList.toggle("oled", theme === "oled");
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

  const setTheme = (t: Theme) => update({ theme: t });
  const openSettings = () => setSettingsOpen(true);

  return (
    <>
      {project ? (
        <Workspace
          key={project.path}
          project={project}
          theme={theme}
          onThemeChange={setTheme}
          onOpenSettings={openSettings}
          onClose={close}
        />
      ) : (
        <Welcome onOpen={setProject} theme={theme} onThemeChange={setTheme} onOpenSettings={openSettings} />
      )}
      <UpdateButton />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export default function App() {
  return <SettingsProvider>{(loaded) => (loaded ? <Shell /> : null)}</SettingsProvider>;
}
