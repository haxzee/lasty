import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Variant = "primary" | "glass" | "plain";

const VARIANTS: Record<Variant, string> = {
  primary: "glass !bg-accent text-on-accent [--rim-hi:rgb(255_255_255/0.6)] [--rim-lo:rgb(255_255_255/0.15)] active:brightness-90",
  glass: "glass text-fg hover:!bg-[var(--glass-strong)] active:brightness-95",
  plain: "text-muted hover:bg-hover hover:text-fg",
};

export function Button({
  variant = "glass",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex h-8 cursor-default items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-medium
        transition-[filter,background-color] disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`grid size-8 cursor-default place-items-center rounded-full text-muted hover:bg-hover hover:text-fg active:bg-separator ${className}`}
      {...props}
    />
  );
}

export function Icon({ children, className = "size-4" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export type Theme = "light" | "dark" | "oled";

export const isMac = navigator.userAgent.includes("Mac");

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export type MenuEntry = MenuItem | "separator";

/** A right-click menu shown at the given window coordinates. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ x: Math.min(x, window.innerWidth - width - 8), y: Math.min(y, window.innerHeight - height - 8) });
  }, [x, y]);

  useEffect(() => {
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "mousedown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="glass fixed z-[60] min-w-44 rounded-[12px] !bg-[var(--glass-strong)] p-1 text-[13px] animate-[widget-in_120ms_cubic-bezier(.2,.8,.2,1)]"
      style={{ left: pos.x, top: pos.y, transformOrigin: "top left" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item === "separator" ? (
          <div key={i} className="mx-2 my-1 h-px bg-separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex h-7 w-full cursor-default items-center rounded-[8px] px-2.5 text-left disabled:opacity-40 ${
              item.danger ? "text-bad hover:bg-bad hover:text-white" : "hover:bg-accent hover:text-on-accent"
            }`}
          >
            {item.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** A small centered dialog with the app's glass look. Closes on Escape or a click outside. */
export function Dialog({ title, onClose, children, width = 440 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-6 animate-[fade-in_150ms_ease-out]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={title}
        className="glass flex max-h-full flex-col overflow-hidden rounded-[22px] !bg-sidebar/95 animate-[dialog-in_220ms_cubic-bezier(.2,.9,.3,1.1)]"
        style={{ width: `min(${width}px, 100%)` }}
      >
        <header className="flex h-12 shrink-0 items-center justify-between pl-5 pr-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton onClick={onClose} title="Close (Esc)">
            <Icon className="size-3.5">
              <path d="M6 6l12 12M18 6L6 18" />
            </Icon>
          </IconButton>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
