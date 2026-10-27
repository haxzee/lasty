import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Theme } from "./components/ui";

export type EditorColors = "color" | "graphite";
export type Engine = "auto" | "pdflatex" | "xelatex" | "lualatex" | "tectonic";

export interface Settings {
  reopenLastProject: boolean;
  theme: Theme;
  editorColors: EditorColors;
  editorFontFamily: string;
  editorFontSize: number;
  editorLineHeight: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  stickyScroll: boolean;
  smoothCaret: boolean;
  typingAnimation: boolean;
  autocomplete: boolean;
  autoCloseEnvironments: boolean;
  engine: Engine;
  autoCompile: boolean;
  compileDelay: number;
}

export const DEFAULT_FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace';

export const DEFAULT_SETTINGS: Settings = {
  reopenLastProject: true,
  theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  editorColors: "color",
  editorFontFamily: DEFAULT_FONT_FAMILY,
  editorFontSize: 13,
  editorLineHeight: 1.6,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  minimap: true,
  stickyScroll: true,
  smoothCaret: true,
  typingAnimation: true,
  autocomplete: true,
  autoCloseEnvironments: true,
  engine: "auto",
  autoCompile: true,
  compileDelay: 300,
};

function legacyValues(): Partial<Settings> {
  const out: Partial<Settings> = {};
  try {
    const theme = localStorage.getItem("lasty.theme");
    if (theme === "light" || theme === "dark" || theme === "oled") out.theme = theme;
    const size = Number(localStorage.getItem("lasty.fontSize"));
    if (size) out.editorFontSize = size;
  } catch {}
  return out;
}

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: (loaded: boolean) => ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    api
      .getSettings()
      .then((stored) => setSettings({ ...DEFAULT_SETTINGS, ...legacyValues(), ...(stored ?? {}) }))
      .catch(() => setSettings({ ...DEFAULT_SETTINGS, ...legacyValues() }))
      .finally(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: Settings) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => api.saveSettings(next).catch(() => {}), 250);
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) =>
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      }),
    [persist],
  );

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS);
  }, [persist]);

  return <SettingsContext.Provider value={{ settings, update, reset }}>{children(loaded)}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
