import { useEffect, useState, type ReactNode } from "react";
import { DEFAULT_FONT_FAMILY, useSettings, type EditorColors, type Engine } from "../settings";
import { Button, Icon, IconButton, type Theme } from "./ui";

type Section = "general" | "appearance" | "editor" | "compiler";

const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  {
    id: "general",
    label: "General",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
      </>
    ),
  },
  {
    id: "editor",
    label: "Editor",
    icon: <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" />,
  },
  {
    id: "compiler",
    label: "Compiler",
    icon: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>
    ),
  },
];

const FONTS = [
  { label: "Menlo (Default)", value: DEFAULT_FONT_FAMILY },
  { label: "SF Mono", value: '"SF Mono", Menlo, monospace' },
  { label: "Monaco", value: "Monaco, Menlo, monospace" },
  { label: "Consolas", value: 'Consolas, "Courier New", monospace' },
  { label: "Cascadia Code", value: '"Cascadia Code", Consolas, monospace' },
  { label: "Courier New", value: '"Courier New", monospace' },
];

const ENGINES: { value: Engine; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "pdflatex", label: "pdfLaTeX" },
  { value: "xelatex", label: "XeLaTeX" },
  { value: "lualatex", label: "LuaLaTeX" },
  { value: "tectonic", label: "Tectonic (built in)" },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 cursor-default rounded-full transition-colors duration-200 ${
        checked ? "bg-accent" : "bg-separator"
      }`}
    >
      <span
        className={`absolute top-[2px] size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-200 ease-[cubic-bezier(.3,1.3,.5,1)] ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        } ${checked ? "dark:bg-[#1d1d1f]" : ""}`}
      />
    </button>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex h-7 shrink-0 rounded-full bg-hover p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`cursor-default rounded-full px-3 text-xs font-medium transition-colors ${
            value === o.value ? "bg-control text-fg shadow-[0_0.5px_2px_rgb(0_0_0/0.2)]" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-7 cursor-default appearance-none rounded-full border border-separator bg-control py-0 pl-3 pr-8 text-xs font-medium outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted">
        <path d="M7 10l5 5 5-5" />
      </Icon>
    </div>
  );
}

function Stepper({ value, min, max, step = 1, unit, onChange }: { value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="flex h-7 shrink-0 items-center rounded-full bg-hover">
      <button onClick={() => set(value - step)} disabled={value <= min} className="grid h-7 w-7 cursor-default place-items-center rounded-full text-muted hover:text-fg disabled:opacity-30">
        −
      </button>
      <span className="min-w-14 text-center text-xs font-medium tabular-nums">
        {value} {unit}
      </span>
      <button onClick={() => set(value + step)} disabled={value >= max} className="grid h-7 w-7 cursor-default place-items-center rounded-full text-muted hover:text-fg disabled:opacity-30">
        +
      </button>
    </div>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h3 className="mb-2 px-1 text-[11px] font-semibold text-muted">{title}</h3>}
      <div className="divide-y divide-separator overflow-hidden rounded-xl bg-sheet shadow-[0_0_0_0.5px_var(--edge)]">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-4 px-4 py-2">
      <div className="min-w-0 flex-1">
        <div>{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings: s, update, reset } = useSettings();
  const [section, setSection] = useState<Section>("appearance");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-6 animate-[fade-in_150ms_ease-out]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Settings"
        className="glass flex h-[min(560px,100%)] w-[min(760px,100%)] overflow-hidden rounded-[22px] !bg-sidebar/90 animate-[dialog-in_220ms_cubic-bezier(.2,.9,.3,1.1)]"
      >
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 p-3 max-sm:hidden">
          <h2 className="px-2 pb-3 pt-1 text-[15px] font-semibold">Settings</h2>
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              onClick={() => setSection(sec.id)}
              className={`flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2 text-left ${
                section === sec.id ? "bg-selected font-medium" : "text-fg/80 hover:bg-hover"
              }`}
            >
              <Icon className="size-4 text-muted">{sec.icon}</Icon>
              {sec.label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col bg-sheet/60">
          <header className="flex h-12 shrink-0 items-center justify-between px-5">
            <h2 className="text-[15px] font-semibold">{SECTIONS.find((x) => x.id === section)!.label}</h2>
            <IconButton onClick={onClose} title="Close (Esc)">
              <Icon className="size-3.5">
                <path d="M6 6l12 12M18 6L6 18" />
              </Icon>
            </IconButton>
          </header>

          <div className="flex-1 overflow-auto px-5 pb-5">
            {section === "general" && (
              <>
                <Group>
                  <Row label="Reopen last project on launch" hint="Otherwise Lasty starts on the welcome screen.">
                    <Toggle label="Reopen last project" checked={s.reopenLastProject} onChange={(v) => update({ reopenLastProject: v })} />
                  </Row>
                </Group>
                <Group>
                  <Row label="Reset all settings" hint="Restores every option on this page to its default.">
                    <Button onClick={reset}>Reset</Button>
                  </Row>
                </Group>
              </>
            )}

            {section === "appearance" && (
              <>
                <Group>
                  <Row label="Theme">
                    <Segmented<Theme>
                      value={s.theme}
                      onChange={(theme) => update({ theme })}
                      options={[
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                        { value: "oled", label: "OLED" },
                      ]}
                    />
                  </Row>
                  <Row label="Syntax colors" hint="Color uses soft hues; Graphite stays monochrome.">
                    <Segmented<EditorColors>
                      value={s.editorColors}
                      onChange={(editorColors) => update({ editorColors })}
                      options={[
                        { value: "color", label: "Color" },
                        { value: "graphite", label: "Graphite" },
                      ]}
                    />
                  </Row>
                </Group>
                <Group title="Motion">
                  <Row label="Smooth cursor" hint="The cursor glides to its new position.">
                    <Toggle label="Smooth cursor" checked={s.smoothCaret} onChange={(v) => update({ smoothCaret: v })} />
                  </Row>
                  <Row label="Typing animation" hint="New characters fade in briefly.">
                    <Toggle label="Typing animation" checked={s.typingAnimation} onChange={(v) => update({ typingAnimation: v })} />
                  </Row>
                </Group>
              </>
            )}

            {section === "editor" && (
              <>
                <Group title="Text">
                  <Row label="Font">
                    <Select value={s.editorFontFamily} options={FONTS} onChange={(editorFontFamily) => update({ editorFontFamily })} />
                  </Row>
                  <Row label="Font size" hint="Also Ctrl/⌘ + and − in the editor.">
                    <Stepper value={s.editorFontSize} min={9} max={32} unit="px" onChange={(editorFontSize) => update({ editorFontSize })} />
                  </Row>
                  <Row label="Line spacing">
                    <Segmented<number>
                      value={s.editorLineHeight}
                      onChange={(editorLineHeight) => update({ editorLineHeight })}
                      options={[
                        { value: 1.4, label: "Compact" },
                        { value: 1.6, label: "Normal" },
                        { value: 1.9, label: "Relaxed" },
                      ]}
                    />
                  </Row>
                  <Row label="Tab size">
                    <Segmented<number>
                      value={s.tabSize}
                      onChange={(tabSize) => update({ tabSize })}
                      options={[
                        { value: 2, label: "2" },
                        { value: 4, label: "4" },
                      ]}
                    />
                  </Row>
                  <Row label="Wrap long lines">
                    <Toggle label="Wrap long lines" checked={s.wordWrap} onChange={(v) => update({ wordWrap: v })} />
                  </Row>
                </Group>
                <Group title="Layout">
                  <Row label="Line numbers">
                    <Toggle label="Line numbers" checked={s.lineNumbers} onChange={(v) => update({ lineNumbers: v })} />
                  </Row>
                  <Row label="Minimap">
                    <Toggle label="Minimap" checked={s.minimap} onChange={(v) => update({ minimap: v })} />
                  </Row>
                  <Row label="Sticky section headings" hint="Keeps the current \section visible while scrolling.">
                    <Toggle label="Sticky headings" checked={s.stickyScroll} onChange={(v) => update({ stickyScroll: v })} />
                  </Row>
                </Group>
                <Group title="Assistance">
                  <Row label="Autocomplete" hint="Suggestions after \, \begin{, \ref{, \cite{ and more.">
                    <Toggle label="Autocomplete" checked={s.autocomplete} onChange={(v) => update({ autocomplete: v })} />
                  </Row>
                  <Row label="Close environments" hint="Adds \end{…} when you press Enter after \begin{…}.">
                    <Toggle label="Close environments" checked={s.autoCloseEnvironments} onChange={(v) => update({ autoCloseEnvironments: v })} />
                  </Row>
                </Group>
              </>
            )}

            {section === "compiler" && (
              <Group>
                <Row label="LaTeX engine" hint="Automatic uses an installed pdfLaTeX, otherwise the Tectonic engine built into Lasty. XeLaTeX and LuaLaTeX need a TeX installation.">
                  <Select<Engine> value={s.engine} options={ENGINES} onChange={(engine) => update({ engine })} />
                </Row>
                <Row label="Compile while typing" hint="Otherwise compile with ⌘S / Ctrl+S or the Compile button.">
                  <Toggle label="Compile while typing" checked={s.autoCompile} onChange={(v) => update({ autoCompile: v })} />
                </Row>
                <Row label="Delay after typing" hint="How long to wait after the last keystroke before saving and compiling.">
                  <Stepper value={s.compileDelay} min={100} max={3000} step={100} unit="ms" onChange={(compileDelay) => update({ compileDelay })} />
                </Row>
              </Group>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
