import type { ButtonHTMLAttributes, ReactNode } from "react";

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

const THEMES: { id: Theme; label: string; icon: ReactNode }[] = [
  {
    id: "light",
    label: "Light",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  { id: "dark", label: "Dark", icon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /> },
  { id: "oled", label: "OLED (true black)", icon: <circle cx="12" cy="12" r="8" fill="currentColor" /> },
];

export function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const index = THEMES.findIndex((t) => t.id === theme);
  return (
    <div role="radiogroup" aria-label="Appearance" className="glass flex h-8 items-center rounded-full p-[3px]">
      <span
        aria-hidden
        className="glass absolute top-[3px] h-[26px] w-8 rounded-full !bg-[var(--glass-strong)] transition-transform duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 32}px)` }}
      />
      {THEMES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={theme === t.id}
          title={t.label}
          onClick={() => onChange(t.id)}
          className={`relative grid h-[26px] w-8 cursor-default place-items-center rounded-full ${
            theme === t.id ? "text-fg" : "text-muted hover:text-fg"
          }`}
        >
          <Icon className="size-3.5">{t.icon}</Icon>
        </button>
      ))}
    </div>
  );
}

export const isMac = navigator.userAgent.includes("Mac");
