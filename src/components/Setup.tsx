import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { useSettings, type EditorColors, type Engine, type SpellLanguage } from "../settings";
import { switchTheme } from "../theme";
import { AppIcon } from "./AppIcon";
import { Segmented, Stepper, Toggle } from "./SettingsDialog";
import { Button, Icon, isMac, type Theme } from "./ui";

const STEPS = ["Welcome", "Appearance", "Writing", "Compiler", "Ready"] as const;

const ENGINE_LABELS: Record<string, string> = {
  pdflatex: "pdfLaTeX",
  xelatex: "XeLaTeX",
  lualatex: "LuaLaTeX",
  tectonic: "Tectonic",
};

const THEMES: { id: Theme; label: string; bg: string; line: string; text: string }[] = [
  { id: "light", label: "Light", bg: "#ffffff", line: "#e6e6ea", text: "#3d3d43" },
  { id: "dark", label: "Dark", bg: "#1e1e1e", line: "#2e2e31", text: "#c9c9cf" },
  { id: "oled", label: "OLED", bg: "#000000", line: "#161618", text: "#c9c9cf" },
];

function ThemeCard({ theme, selected, onSelect }: { theme: (typeof THEMES)[number]; selected: boolean; onSelect: () => void }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`group flex cursor-default flex-col items-center gap-2.5 rounded-[18px] p-2 transition-colors ${selected ? "bg-selected" : "hover:bg-hover"}`}
    >
      <div
        className={`h-24 w-36 overflow-hidden rounded-[12px] p-3 text-left shadow-[0_0_0_0.5px_rgb(0_0_0/0.15),0_2px_8px_rgb(0_0_0/0.12)] transition-transform duration-300 ease-[cubic-bezier(.2,.9,.3,1.2)] ${
          selected ? "scale-[1.04]" : "group-hover:scale-[1.02]"
        }`}
        style={{ background: theme.bg }}
      >
        <div className="font-mono text-[9px] leading-[15px]" style={{ color: theme.text }}>
          <div>
            <span style={{ color: "#e3b780" }}>\section</span>
            {"{Intro}"}
          </div>
          <div className="opacity-70">Lorem ipsum dolor</div>
          <div className="mt-1 h-1.5 w-20 rounded-full" style={{ background: theme.line }} />
          <div className="mt-1 h-1.5 w-14 rounded-full" style={{ background: theme.line }} />
        </div>
      </div>
      <span className={`text-[13px] ${selected ? "font-semibold" : "text-muted"}`}>{theme.label}</span>
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1 text-left">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="w-full divide-y divide-separator overflow-hidden rounded-[16px] bg-sheet shadow-[0_0_0_0.5px_var(--edge)]">{children}</div>;
}

export default function Setup() {
  const { settings: s, update } = useSettings();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const [engines, setEngines] = useState<string[] | null>(null);

  useEffect(() => {
    const minimum = new Promise((r) => setTimeout(r, 900));
    Promise.all([api.availableEngines().catch(() => []), minimum]).then(([found]) => setEngines(found));
  }, []);

  const last = step === STEPS.length - 1;
  const go = (delta: 1 | -1) => {
    if (leaving) return;
    setDirection(delta);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return setStep((n) => Math.min(STEPS.length - 1, Math.max(0, n + delta)));
    }
    setLeaving(true);
    leaveTimer.current = window.setTimeout(() => {
      setLeaving(false);
      setStep((n) => Math.min(STEPS.length - 1, Math.max(0, n + delta)));
    }, 220);
  };
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const [closing, setClosing] = useState(false);
  const finish = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => update({ setupDone: true }), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 380);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (e.target as HTMLElement).tagName === "SELECT") return;
      e.preventDefault();
      last ? finish() : go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hasTex = engines?.some((e) => e !== "tectonic");
  const engineOptions: { value: Engine; label: string; detail: string }[] = [
    { value: "auto", label: "Automatic", detail: hasTex ? "Uses your pdfLaTeX installation" : "Uses Tectonic, built into Lasty" },
    ...(engines ?? []).map((e) => ({
      value: e as Engine,
      label: ENGINE_LABELS[e] ?? e,
      detail: e === "tectonic" ? "Downloads packages as needed" : "From your TeX installation",
    })),
  ];

  const pages: ReactNode[] = [
    <div key="welcome" className="flex flex-col items-center text-center">
      <div className="relative animate-[logo-in_900ms_cubic-bezier(.2,.9,.3,1.2)_both]">
        <div className="motion absolute -inset-6 -z-10 rounded-[48px] bg-fg/10 blur-2xl animate-[breathe_4s_1.4s_ease-in-out_infinite]" />
        <AppIcon size={128} animated />
      </div>
      <h1 className="mt-8 text-[40px] font-semibold tracking-tight animate-[rise-in_800ms_700ms_cubic-bezier(.2,.8,.2,1)_both]">
        Welcome to Lasty
      </h1>
      <p className="mt-3 max-w-sm text-[15px] text-muted animate-[rise-in_800ms_850ms_cubic-bezier(.2,.8,.2,1)_both]">
        Write LaTeX with a live PDF preview, entirely on your computer. Let’s set things up. It takes less than a minute.
      </p>
    </div>,

    <div key="appearance" className="stagger flex w-full flex-col items-center text-center">
      <h2 className="text-[28px] font-semibold tracking-tight">Choose your look</h2>
      <p className="mt-2 text-muted">You can change this any time in Settings.</p>
      <div role="radiogroup" className="mt-8 flex gap-3">
        {THEMES.map((t) => (
          <ThemeCard key={t.id} theme={t} selected={s.theme === t.id} onSelect={() => s.theme !== t.id && switchTheme(t.id, () => update({ theme: t.id }))} />
        ))}
      </div>
      <div className="mt-8 w-full max-w-md">
        <Card>
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
        </Card>
      </div>
    </div>,

    <div key="writing" className="stagger flex w-full max-w-md flex-col items-center text-center">
      <h2 className="text-[28px] font-semibold tracking-tight">How do you write?</h2>
      <p className="mt-2 text-muted">A few defaults for the editor.</p>
      <div className="stagger mt-8 w-full space-y-4">
        <Card>
          <Row label="Spell checking" hint="Skips commands, math and labels.">
            <Segmented<SpellLanguage>
              value={s.spellCheck}
              onChange={(spellCheck) => update({ spellCheck })}
              options={[
                { value: "off", label: "Off" },
                { value: "en", label: "English" },
                { value: "de", label: "Deutsch" },
              ]}
            />
          </Row>
          <Row label="Font size">
            <Stepper value={s.editorFontSize} min={9} max={32} unit="px" onChange={(editorFontSize) => update({ editorFontSize })} />
          </Row>
        </Card>
        <div
          className="rounded-[16px] bg-sheet px-4 py-3 text-left shadow-[0_0_0_0.5px_var(--edge)] transition-[font-size] duration-200"
          style={{ fontFamily: s.editorFontFamily, fontSize: s.editorFontSize, lineHeight: s.editorLineHeight }}
        >
          <span className="text-[#2d7a68] dark:text-[#8ec5b4]">\emph</span>
          {"{Lasty}"} makes $E = mc^2$ look good.
        </div>
        <Card>
          <Row label="Autocomplete" hint="Suggestions after \, \begin{, \ref{ and \cite{.">
            <Toggle label="Autocomplete" checked={s.autocomplete} onChange={(autocomplete) => update({ autocomplete })} />
          </Row>
          <Row label="Smooth typing" hint="Characters glide in and the cursor moves smoothly.">
            <Toggle
              label="Smooth typing"
              checked={s.typingAnimation && s.smoothCaret}
              onChange={(v) => update({ typingAnimation: v, smoothCaret: v })}
            />
          </Row>
        </Card>
      </div>
    </div>,

    <div key="compiler" className="stagger flex w-full max-w-md flex-col items-center text-center">
      <h2 className="text-[28px] font-semibold tracking-tight">Typesetting</h2>
      <p className="mt-2 text-muted">
        {engines === null
          ? "Looking for LaTeX on this computer…"
          : hasTex
            ? "Lasty found a TeX installation on this computer."
            : "No TeX installation found. That’s fine: Lasty brings its own engine."}
      </p>
      <div className="mt-8 w-full space-y-4">
        {engines === null ? (
          <Card>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                <span className="skeleton size-[18px] rounded-full" />
                <span className="flex-1 space-y-1.5">
                  <span className="skeleton block h-2.5 w-24 rounded-full" />
                  <span className="skeleton block h-2 w-40 rounded-full" />
                </span>
              </div>
            ))}
          </Card>
        ) : (
        <Card>
          {engineOptions.map((o, i) => (
            <button
              key={o.value}
              style={{ animation: `rise-in 500ms ${i * 70}ms cubic-bezier(.2,.8,.2,1) both` }}
              role="radio"
              aria-checked={s.engine === o.value}
              onClick={() => update({ engine: o.value })}
              className="flex min-h-12 w-full cursor-default items-center gap-3 px-4 py-2.5 text-left hover:bg-hover"
            >
              <span
                className={`grid size-[18px] shrink-0 place-items-center rounded-full transition-colors ${
                  s.engine === o.value ? "bg-accent text-on-accent" : "shadow-[inset_0_0_0_1.5px_var(--separator)]"
                }`}
              >
                {s.engine === o.value && (
                  <Icon className="size-3">
                    <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} strokeDasharray="1" style={{ animation: "draw 260ms ease-out both" }} />
                  </Icon>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px]">{o.label}</span>
                <span className="block text-xs text-muted">{o.detail}</span>
              </span>
              {o.value === "auto" && <span className="text-[11px] font-medium text-muted">Recommended</span>}
            </button>
          ))}
        </Card>
        )}
        <Card>
          <Row label="Compile while typing" hint="Otherwise compile with ⌘S / Ctrl+S.">
            <Toggle label="Compile while typing" checked={s.autoCompile} onChange={(autoCompile) => update({ autoCompile })} />
          </Row>
        </Card>
      </div>
    </div>,

    <div key="ready" className="flex flex-col items-center text-center">
      <div className="relative">
        {Array.from({ length: 14 }, (_, i) => {
          const angle = (i / 14) * Math.PI * 2;
          const dist = 70 + (i % 3) * 18;
          return (
            <span
              key={i}
              className="motion motion-hide absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] size-1.5 rounded-full bg-fg"
              style={
                {
                  "--dx": `${Math.cos(angle) * dist}px`,
                  "--dy": `${Math.sin(angle) * dist}px`,
                  animation: `burst 900ms ${380 + (i % 4) * 30}ms cubic-bezier(.2,.8,.2,1) both`,
                } as React.CSSProperties
              }
            />
          );
        })}
        <div className="grid size-20 place-items-center rounded-full bg-accent text-on-accent animate-[pop_650ms_cubic-bezier(.2,.9,.3,1.2)_both]">
          <Icon className="size-9">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              strokeWidth="2.5"
              pathLength={1}
              strokeDasharray="1"
              className="motion"
              style={{ animation: "draw 450ms 320ms cubic-bezier(.65,0,.35,1) both" }}
            />
          </Icon>
        </div>
      </div>
      <h2 className="mt-8 text-[32px] font-semibold tracking-tight animate-[rise-in_700ms_450ms_cubic-bezier(.2,.8,.2,1)_both]">You’re all set</h2>
      <p className="mt-3 max-w-sm text-[15px] text-muted animate-[rise-in_700ms_560ms_cubic-bezier(.2,.8,.2,1)_both]">
        Create a project or open a folder with your .tex files. Press {isMac ? "⌘P" : "Ctrl+P"} to jump between files and{" "}
        {isMac ? "⌘," : "Ctrl+,"} for Settings.
      </p>
    </div>,
  ];

  return (
    <div
      className="flex h-full flex-col"
      style={closing ? { animation: "fade-out-up 380ms cubic-bezier(.4,0,1,1) both" } : undefined}
    >
      <div data-tauri-drag-region className="h-[52px] shrink-0" />
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto px-8">
        <div
          key={step}
          className="flex w-full max-w-2xl justify-center py-6"
          style={{
            animation: leaving
              ? `${direction > 0 ? "leave-next" : "leave-back"} 220ms cubic-bezier(.4,0,1,1) both`
              : `${direction > 0 ? "step-next" : "step-back"} 480ms cubic-bezier(.2,.8,.2,1) both`,
          }}
        >
          {pages[step]}
        </div>
      </div>
      <footer className="flex h-20 shrink-0 items-center justify-between px-8 animate-[fade-in_600ms_1s_ease-out_both]">
        <div className="w-28">
          {step > 0 && !last && (
            <Button variant="plain" onClick={() => go(-1)}>
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((name, i) => (
            <span
              key={name}
              title={name}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-fg" : i < step ? "w-1.5 bg-muted" : "w-1.5 bg-separator"}`}
            />
          ))}
        </div>
        <div className="flex w-28 justify-end">
          <Button variant="primary" onClick={last ? finish : () => go(1)}>
            {step === 0 ? "Get Started" : last ? "Start Writing" : "Continue"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
