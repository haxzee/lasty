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

export const isMac = navigator.userAgent.includes("Mac");
