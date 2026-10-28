import { flushSync } from "react-dom";
import type { Theme } from "./components/ui";

let lastPointer: { x: number; y: number } | null = null;
window.addEventListener("pointerdown", (e) => (lastPointer = { x: e.clientX, y: e.clientY }), true);

export function applyThemeClasses(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme !== "light");
  root.classList.toggle("oled", theme === "oled");
}

/** Switches the theme with a circular reveal that grows from the last click. */
export function switchTheme(theme: Theme, commit: () => void) {
  const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
  if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return commit();
  const root = document.documentElement;
  root.style.setProperty("--vt-x", `${lastPointer?.x ?? innerWidth / 2}px`);
  root.style.setProperty("--vt-y", `${lastPointer?.y ?? innerHeight / 2}px`);
  doc.startViewTransition(() => {
    applyThemeClasses(theme);
    flushSync(commit);
  });
}
